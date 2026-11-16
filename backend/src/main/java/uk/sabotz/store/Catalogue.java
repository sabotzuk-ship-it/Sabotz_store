package uk.sabotz.store;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.text.Normalizer;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@RestController
@DependsOnDatabaseInitialization
class Catalogue implements InitializingBean {
    private static final Set<String> PUBLIC_PRODUCT_FIELDS = Set.of(
            "id", "nome", "marca", "status", "categoria", "preco", "discountPercent", "fotos", "pagina");
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final Photos photos;

    Catalogue(JdbcTemplate db, ObjectMapper json, Photos photos) {
        this.db = db;
        this.json = json;
        this.photos = photos;
    }

    @Override
    public void afterPropertiesSet() throws IOException {
        seed("products", "products.json", "produtos");
        seed("settings", "site-settings.json", null);
        seed("orders", "orders.json", null);
        for (JsonNode product : products()) {
            for (JsonNode path : product.path("fotos")) photos.importUpload(path.asText());
        }
        for (JsonNode category : settings().path("categories")) photos.importUpload(category.path("image").asText());
    }

    private void seed(String key, String file, String field) throws IOException {
        try (var stream = new ClassPathResource("seed/data/" + file).getInputStream()) {
            JsonNode document = json.readTree(stream);
            if (field != null) document = document.path(field);
            db.update("""
                    INSERT INTO store_documents(name, content)
                    SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM store_documents WHERE name = ?)
                    """, key, document.toString(), key);
        }
    }

    @GetMapping("/api/products")
    JsonNode products() throws IOException {
        ArrayNode visible = json.createArrayNode();
        for (JsonNode item : adminProducts()) {
            ObjectNode product = ((ObjectNode) item).deepCopy();
            product.retain(PUBLIC_PRODUCT_FIELDS);
            visible.add(product);
        }
        return visible;
    }

    @GetMapping("/api/admin/products")
    JsonNode adminProducts() throws IOException {
        return read("products", false);
    }

    @GetMapping("/api/site-settings")
    JsonNode settings() throws IOException {
        return read("settings", false);
    }

    @GetMapping("/api/admin/orders")
    JsonNode orders() throws IOException {
        return read("orders", false);
    }

    @PostMapping("/api/admin/products")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional(rollbackFor = IOException.class)
    JsonNode add(@RequestBody ObjectNode body) throws IOException {
        return save(body, null);
    }

    @PutMapping("/api/admin/products/{id}")
    @Transactional(rollbackFor = IOException.class)
    JsonNode update(@PathVariable String id, @RequestBody ObjectNode body) throws IOException {
        return save(body, id);
    }

    @DeleteMapping("/api/admin/products/{id}")
    @Transactional(rollbackFor = IOException.class)
    JsonNode delete(@PathVariable String id) throws IOException {
        var products = (ArrayNode) read("products", true);
        products.remove(indexOf(products, id));
        write("products", products);
        return products;
    }

    private JsonNode save(ObjectNode body, String id) throws IOException {
        var products = (ArrayNode) read("products", true);
        int index = id == null ? -1 : indexOf(products, id);
        var product = json.createObjectNode();
        product.put("nome", required(body, "nome", 140));
        product.put("marca", required(body, "marca", 80));
        product.put("status", required(body, "status", 60));
        String category = required(body, "categoria", 60);
        boolean categoryExists = false;
        for (JsonNode item : settings().path("categories")) {
            if (category.equals(item.path("name").asText())) categoryExists = true;
        }
        if (!categoryExists) throw bad("Choose a valid product category.");
        product.put("categoria", category);

        JsonNode price = body.path("preco");
        if (!price.isMissingNode()) {
            if (!price.isNumber() || !Double.isFinite(price.asDouble()) || price.asDouble() < 0 || price.asDouble() > 10_000_000) {
                throw bad("Enter a valid non-negative product price.");
            }
            product.set("preco", price);
        }
        JsonNode discount = body.path("discountPercent");
        if (!discount.isMissingNode()) {
            if (!discount.isIntegralNumber() || !discount.canConvertToInt() || discount.asInt() < 1 || discount.asInt() > 100 || price.asDouble() <= 0) {
                throw bad("Set a price above £0 and enter a whole discount from 1 to 100.");
            }
            product.set("discountPercent", discount);
        }
        JsonNode images = body.path("fotos");
        if (!images.isArray() || images.isEmpty() || images.size() > 20) throw bad("Add between 1 and 20 product images.");
        for (JsonNode item : images) {
            if (!item.isTextual() || !photos.exists(item.textValue())) throw bad("Upload the product images before saving.");
        }
        product.set("fotos", images);

        Set<String> slugs = new HashSet<>();
        for (int i = 0; i < products.size(); i++) {
            if (i != index) slugs.add(slug(products.get(i).path("pagina").asText()));
        }
        String page;
        if (body.has("pagina")) {
            page = required(body, "pagina", 180);
            if (!page.matches("(?:products/)?[a-z0-9]+(?:-[a-z0-9]+)*(?:\\.html)?")) throw bad("Use a lowercase product slug.");
            if (slugs.contains(slug(page))) throw conflict("This product slug is already in use.");
        } else if (index >= 0) {
            page = products.get(index).path("pagina").asText();
        } else {
            String base = Normalizer.normalize(product.path("nome").asText(), Normalizer.Form.NFKD)
                    .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-")
                    .replaceAll("^-|-$", "");
            if (base.isEmpty()) base = "product";
            String candidate = base;
            for (int suffix = 2; slugs.contains(candidate); suffix++) candidate = base + "-" + suffix;
            page = "products/" + candidate + ".html";
        }
        product.put("pagina", page);
        product.put("id", id == null ? UUID.randomUUID().toString() : id);
        if (body.has("sourcing")) {
            product.set("sourcing", validateSourcing(body.get("sourcing")));
        } else if (index >= 0 && products.get(index).has("sourcing")) {
            product.set("sourcing", products.get(index).get("sourcing"));
        }
        if (index < 0) products.insert(0, product);
        else products.set(index, product);
        write("products", products);
        return products;
    }

    private ObjectNode validateSourcing(JsonNode input) {
        if (!input.isObject()) throw bad("Check the supplier details.");
        ObjectNode sourcing = json.createObjectNode();
        JsonNode link = input.path("supplierUrl");
        if (!link.isMissingNode()) {
            String value = link.asText("").trim();
            try {
                URI uri = URI.create(value);
                String scheme = uri.getScheme();
                if (!link.isTextual() || value.length() > 2048 || uri.getHost() == null
                        || uri.getRawUserInfo() != null
                        || !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
                    throw new IllegalArgumentException();
                }
            } catch (IllegalArgumentException error) {
                throw bad("Enter a valid HTTP or HTTPS supplier link.");
            }
            sourcing.put("supplierUrl", value);
        }
        for (String field : Set.of("itemCost", "shippingCost")) {
            JsonNode amount = input.path(field);
            if (amount.isMissingNode()) continue;
            if (!amount.isNumber() || !Double.isFinite(amount.asDouble())) {
                throw bad("Enter non-negative costs in GBP with up to two decimal places.");
            }
            BigDecimal cost = amount.decimalValue().stripTrailingZeros();
            if (cost.signum() < 0 || cost.compareTo(BigDecimal.valueOf(10_000_000)) > 0 || cost.scale() > 2) {
                throw bad("Enter non-negative costs in GBP with up to two decimal places.");
            }
            sourcing.set(field, amount);
        }
        return sourcing;
    }

    @PutMapping("/api/admin/site-settings")
    @Transactional(rollbackFor = IOException.class)
    JsonNode saveSettings(@RequestBody JsonNode body) throws IOException {
        JsonNode products = read("products", true);
        JsonNode incoming = body.path("categories");
        if (!incoming.isArray() || incoming.size() > 12) throw bad("Add up to 12 store categories.");
        Set<String> ids = new HashSet<>();
        Set<String> names = new HashSet<>();
        ObjectNode settings = json.createObjectNode();
        ArrayNode categories = settings.putArray("categories");
        for (JsonNode item : incoming) {
            String id = required(item, "id", 100);
            String name = required(item, "name", 60);
            String image = required(item, "image", 200);
            String subtitle = item.path("subtitle").asText("").trim();
            if (!id.matches("[a-z0-9]+(?:-[a-z0-9]+)*") || subtitle.length() > 100 || !item.path("comingSoon").isBoolean()) {
                throw bad("Check the category name, description and coming soon option.");
            }
            if (!ids.add(id) || !names.add(name.toLowerCase(Locale.ROOT))) throw conflict("Category names must be unique.");
            if (!Set.of("shoes.jpg", "clothing.jpg", "accessories.jpg").contains(image)
                    && !(image.startsWith(Photos.UPLOADS) && photos.exists(image))) throw bad("Upload the category image before saving.");
            categories.addObject().put("id", id).put("name", name).put("title", required(item, "title", 80))
                    .put("subtitle", subtitle).put("image", image).put("comingSoon", item.path("comingSoon").asBoolean());
        }
        for (JsonNode product : products) {
            boolean found = false;
            for (JsonNode category : categories) {
                if (category.path("name").equals(product.path("categoria"))) found = true;
            }
            if (!found) throw conflict("Move or remove the products from a category before deleting or renaming it.");
        }
        if (body.has("selectedProductIds")) {
            JsonNode selection = body.path("selectedProductIds");
            if (!selection.isArray() || selection.size() > 3) throw bad("Choose up to three products.");
            Set<String> availableIds = new HashSet<>();
            for (JsonNode product : products) availableIds.add(product.path("id").asText());
            Set<String> selectedIds = new HashSet<>();
            for (JsonNode id : selection) {
                if (!id.isTextual() || !availableIds.contains(id.textValue()) || !selectedIds.add(id.textValue())) {
                    throw bad("Choose distinct products from the catalogue.");
                }
            }
            settings.set("selectedProductIds", selection);
        } else {
            JsonNode selection = read("settings", true).get("selectedProductIds");
            if (selection != null) settings.set("selectedProductIds", selection);
        }
        write("settings", settings);
        return settings;
    }

    private JsonNode read(String key, boolean lock) throws IOException {
        String sql = "SELECT content FROM store_documents WHERE name = ?" + (lock ? " FOR UPDATE" : "");
        return json.readTree(db.queryForObject(sql, String.class, key));
    }

    private void write(String key, JsonNode content) {
        db.update("UPDATE store_documents SET content = ? WHERE name = ?", content.toString(), key);
    }

    private int indexOf(ArrayNode products, String id) {
        for (int i = 0; i < products.size(); i++) {
            if (id.equals(products.get(i).path("id").asText())) return i;
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found.");
    }

    private String slug(String page) {
        return page.replaceFirst("^products/", "").replaceFirst("\\.html$", "");
    }

    private String required(JsonNode body, String field, int max) {
        String value = body.path(field).isTextual() ? body.path(field).textValue().trim() : "";
        if (value.isEmpty() || value.length() > max) throw bad("Check the " + field + " field.");
        return value;
    }

    static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
