package uk.sabotz.store;

import com.drew.imaging.ImageMetadataReader;
import com.drew.imaging.ImageProcessingException;
import com.drew.metadata.exif.ExifIFD0Directory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

@RestController
class Photos {
    static final String UPLOADS = "assets/images/uploads/";
    private static final String PATH = "assets/images/[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*\\.(?i:jpg|jpeg|png|webp|gif)";
    private static final Set<Integer> WIDTHS = Set.of(160, 480, 800, 1280, 1920);
    private final JdbcTemplate db;

    private record Photo(String mime, byte[] bytes) {}

    Photos(JdbcTemplate db) {
        this.db = db;
    }

    boolean exists(String path) {
        if (!path.matches(PATH)) return false;
        if (path.startsWith(UPLOADS) && Boolean.TRUE.equals(db.queryForObject(
                "SELECT COUNT(*) > 0 FROM store_images WHERE name = ?", Boolean.class, path.substring(UPLOADS.length())))) return true;
        return new ClassPathResource("seed/" + path).exists();
    }

    void importUpload(String path) throws IOException {
        if (!path.startsWith(UPLOADS) || !path.matches(PATH)) return;
        String name = path.substring(UPLOADS.length());
        if (Boolean.TRUE.equals(db.queryForObject("SELECT COUNT(*) > 0 FROM store_images WHERE name = ?", Boolean.class, name))) return;
        var source = load(path);
        db.update("INSERT INTO store_images(name, mime, content) VALUES (?, ?, ?)", name, source.mime, source.bytes);
    }

    @PostMapping("/api/admin/uploads")
    @Transactional(rollbackFor = IOException.class)
    Map<String, List<String>> upload(@RequestParam("images") List<MultipartFile> images) throws IOException {
        if (images.isEmpty() || images.size() > 20) throw Catalogue.bad("Add between 1 and 20 product images.");
        List<String> paths = new ArrayList<>();
        for (MultipartFile image : images) {
            byte[] bytes = image.getBytes();
            String mime = mime(bytes);
            if (mime == null) throw Catalogue.bad("Use a JPG, PNG, WebP or GIF image.");
            String extension = mime.equals("image/jpeg") ? "jpg" : mime.substring("image/".length());
            String name = UUID.randomUUID() + "." + extension;
            db.update("INSERT INTO store_images(name, mime, content) VALUES (?, ?, ?)", name, mime, bytes);
            paths.add(UPLOADS + name);
        }
        return Map.of("fotos", paths);
    }

    @GetMapping("/assets/images/uploads/{name}")
    ResponseEntity<byte[]> original(@PathVariable String name) throws IOException {
        return image(load(UPLOADS + name));
    }

    @GetMapping("/api/images/{width}")
    ResponseEntity<byte[]> resized(@PathVariable int width, @RequestParam String path) throws IOException {
        if (!WIDTHS.contains(width)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Photo source = load(path);
        if (source.mime.equals("image/gif") || source.mime.equals("image/webp")) return image(source);
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(source.bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) return image(source);
            var reader = readers.next();
            try {
                reader.setInput(input);
                int w = reader.getWidth(0);
                int h = reader.getHeight(0);
                if ((long) w * h > 40_000_000) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY);
                int orientation = orientation(source.bytes);
                int imageWidth = orientation >= 5 ? h : w;
                int imageHeight = orientation >= 5 ? w : h;
                double scale = Math.min((double) width / imageWidth, width * 1.6 / imageHeight);
                if (scale >= 1) return image(source);
                var output = new BufferedImage(Math.max(1, (int) (imageWidth * scale)), Math.max(1, (int) (imageHeight * scale)),
                        source.mime.equals("image/png") ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
                var graphics = output.createGraphics();
                try {
                    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    graphics.scale((double) output.getWidth() / imageWidth, (double) output.getHeight() / imageHeight);
                    graphics.drawImage(reader.read(0), orient(orientation, w, h), null);
                } finally {
                    graphics.dispose();
                }
                var bytes = new ByteArrayOutputStream();
                ImageIO.write(output, source.mime.substring(6), bytes);
                return image(bytes.size() < source.bytes.length ? new Photo(source.mime, bytes.toByteArray()) : source);
            } finally {
                reader.dispose();
            }
        }
    }

    private int orientation(byte[] bytes) {
        try {
            var directory = ImageMetadataReader.readMetadata(new ByteArrayInputStream(bytes))
                    .getFirstDirectoryOfType(ExifIFD0Directory.class);
            Integer value = directory == null ? null : directory.getInteger(ExifIFD0Directory.TAG_ORIENTATION);
            return value != null && value >= 1 && value <= 8 ? value : 1;
        } catch (ImageProcessingException | IOException error) {
            return 1;
        }
    }

    private AffineTransform orient(int orientation, int width, int height) {
        return switch (orientation) {
            case 2 -> new AffineTransform(-1, 0, 0, 1, width, 0);
            case 3 -> new AffineTransform(-1, 0, 0, -1, width, height);
            case 4 -> new AffineTransform(1, 0, 0, -1, 0, height);
            case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
            case 6 -> new AffineTransform(0, 1, -1, 0, height, 0);
            case 7 -> new AffineTransform(0, -1, -1, 0, height, width);
            case 8 -> new AffineTransform(0, -1, 1, 0, 0, width);
            default -> new AffineTransform();
        };
    }

    private Photo load(String path) throws IOException {
        if (path.matches(PATH)) {
            if (path.startsWith(UPLOADS)) {
                var rows = db.query("SELECT mime, content FROM store_images WHERE name = ?",
                        (rs, row) -> new Photo(rs.getString(1), rs.getBytes(2)), path.substring(UPLOADS.length()));
                if (!rows.isEmpty()) return rows.get(0);
            }
            var file = new ClassPathResource("seed/" + path);
            if (file.exists()) {
                try (var input = file.getInputStream()) {
                    byte[] bytes = input.readAllBytes();
                    String mime = mime(bytes);
                    if (mime != null) return new Photo(mime, bytes);
                }
            }
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }

    private ResponseEntity<byte[]> image(Photo photo) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(photo.mime))
                .header("X-Content-Type-Options", "nosniff").cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic())
                .body(photo.bytes);
    }

    private String mime(byte[] bytes) {
        if (bytes.length < 12) return null;
        String head = new String(bytes, 0, 12, StandardCharsets.ISO_8859_1);
        if (head.startsWith("\u00ff\u00d8\u00ff")) return "image/jpeg";
        if (head.startsWith("\u0089PNG\r\n\u001a\n")) return "image/png";
        if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "image/gif";
        if (head.startsWith("RIFF") && head.substring(8).equals("WEBP")) return "image/webp";
        return null;
    }
}
