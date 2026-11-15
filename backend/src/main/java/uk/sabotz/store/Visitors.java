package uk.sabotz.store;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import org.slf4j.LoggerFactory;

@RestController
class Visitors {
    private static final long DAY = 86_400_000;
    private static final long RETENTION = 90 * DAY;
    private static final String PAGE = "/(?:|collection|shoes|clothing|accessories|(?:categories|products)/[a-z0-9]+(?:-[a-z0-9]+)*)";
    private static final String RANKING = """
            SELECT path, count(*) AS views, round(avg(seconds)) AS "averageSeconds"
            FROM page_visits WHERE path LIKE ? GROUP BY path
            """;
    private final JdbcTemplate db;
    private final Welcome welcome;
    private final AttemptLimit attempts = new AttemptLimit(8, 60_000);

    Visitors(JdbcTemplate db, Welcome welcome) {
        this.db = db;
        this.welcome = welcome;
    }

    private record Visitor(String id, String email, long enteredAt, boolean tracking) {}
    private record Visit(String path, long openedAt, int seconds) {}
    private record Recent(String id, String email, long enteredAt, boolean tracking, List<Visit> journey) {}

    @GetMapping("/api/visitors/session")
    Map<String, Boolean> session(HttpServletRequest request) {
        return ApiGuard.admin(request) ? state(true, false) : state(current(request, false));
    }

    @PostMapping("/api/visitors/entry")
    Map<String, Boolean> entry(@RequestBody JsonNode body, HttpServletRequest request) {
        if (ApiGuard.admin(request)) return state(true, false);
        Visitor previous = current(request, false);
        boolean tracking = body.path("tracking").isBoolean() && body.path("tracking").booleanValue();
        boolean guest = body.path("email").isNull() && tracking;
        if (previous != null && guest) {
            db.update("UPDATE visitor_entries SET tracking = TRUE WHERE id = ?", previous.id);
            return state(!previous.email.isEmpty(), true);
        }
        if (previous != null && !previous.email.isEmpty()) return state(previous);
        if (!attempts.claim(request.getRemoteAddr())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Please wait a minute and try again.");
        }
        String email = body.path("email").isTextual() ? body.path("email").asText().trim().toLowerCase(Locale.ROOT) : "";
        if (!guest && (email.length() > 254 || !email.matches("[^\\s@,;<>]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)+"))) {
            throw Catalogue.bad("Enter a valid email address.");
        }
        String id = UUID.randomUUID().toString();
        db.update("INSERT INTO visitor_entries VALUES (?, ?, ?, ?)", id, email, System.currentTimeMillis(), tracking);
        request.getSession().setAttribute("visitorId", id);
        if (!email.isEmpty() && welcome.enabled()) CompletableFuture.runAsync(() -> welcome.send(email));
        return state(!email.isEmpty(), tracking);
    }

    @PostMapping("/api/visitors/stop-tracking")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void stop(HttpServletRequest request) {
        if (ApiGuard.admin(request)) return;
        Visitor visitor = current(request, true);
        if (visitor == null) return;
        if (visitor.email.isEmpty()) {
            db.update("DELETE FROM visitor_entries WHERE id = ?", visitor.id);
            request.getSession(false).invalidate();
        } else {
            db.update("UPDATE visitor_entries SET tracking = FALSE WHERE id = ?", visitor.id);
            db.update("DELETE FROM page_visits WHERE visitor_id = ?", visitor.id);
        }
    }

    @PostMapping("/api/visitors/view")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void view(@RequestBody JsonNode body, HttpServletRequest request) {
        if (ApiGuard.admin(request)) return;
        Visitor visitor = current(request, true);
        if (visitor == null || !visitor.tracking) return;
        String viewId = body.path("viewId").asText("");
        String path = body.path("path").asText("");
        JsonNode duration = body.path("seconds");
        if (!viewId.matches("[a-f0-9]{32}") || path.length() > 200 || !path.matches(PAGE)
                || !duration.isIntegralNumber() || !duration.canConvertToInt() || duration.asInt() < 0 || duration.asInt() > 1800) {
            throw Catalogue.bad("Invalid page view.");
        }
        int updated = db.update("""
                UPDATE page_visits SET seconds = GREATEST(seconds, ?)
                WHERE visitor_id = ? AND view_id = ? AND path = ?
                """, duration.asInt(), visitor.id, viewId, path);
        if (updated == 0) {
            db.update("""
                    INSERT INTO page_visits(visitor_id, view_id, path, opened_at, seconds)
                    SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS
                    (SELECT 1 FROM page_visits WHERE visitor_id = ? AND view_id = ?)
                    AND (SELECT count(*) FROM page_visits WHERE visitor_id = ?) < 200
                    """, visitor.id, viewId, path, System.currentTimeMillis(), duration.asInt(), visitor.id, viewId, visitor.id);
        }
    }

    @GetMapping("/api/admin/visitors")
    Map<String, Object> report() {
        purge();
        var totals = db.queryForMap("""
                SELECT count(*) AS entries, count(DISTINCT nullif(email, '')) AS emails,
                  coalesce(sum(CASE WHEN tracking THEN 1 ELSE 0 END), 0) AS tracked FROM visitor_entries
                """);
        var visitors = db.query("SELECT * FROM visitor_entries ORDER BY entered_at DESC LIMIT 30", (rs, row) ->
                new Visitor(rs.getString("id"), rs.getString("email"), rs.getLong("entered_at"), rs.getBoolean("tracking")));
        var recent = new ArrayList<Recent>();
        for (Visitor visitor : visitors) {
            var visits = db.query("""
                    SELECT path, opened_at, seconds FROM page_visits
                    WHERE visitor_id = ? AND path LIKE '/products/%'
                    ORDER BY opened_at DESC, view_id DESC LIMIT 30
                    """, (rs, row) -> new Visit(rs.getString(1), rs.getLong(2), rs.getInt(3)), visitor.id);
            Collections.reverse(visits);
            recent.add(new Recent(visitor.id, visitor.email, visitor.enteredAt, visitor.tracking, visits));
        }
        return Map.of("totals", Map.of("entries", totals.get("entries"), "emails", totals.get("emails"), "tracked", totals.get("tracked")),
                "pages", rank("%", false), "products", rank("/products/%", false),
                "productsByTime", rank("/products/%", true), "recent", recent);
    }

    private List<Map<String, Object>> rank(String filter, boolean timeFirst) {
        String order = timeFirst ? "ORDER BY \"averageSeconds\" DESC, views DESC, path" : "ORDER BY views DESC, path";
        return db.query(RANKING + order + " LIMIT 30", (rs, row) -> Map.of(
                "path", rs.getString(1), "views", rs.getLong(2), "averageSeconds", rs.getInt(3)), filter);
    }

    @Scheduled(fixedDelay = DAY)
    public void purge() {
        long cutoff = System.currentTimeMillis() - RETENTION;
        db.update("DELETE FROM visitor_entries WHERE entered_at < ?", cutoff);
        db.update("DELETE FROM welcome_delivery WHERE attempted_at < ?", cutoff);
    }

    private Visitor current(HttpServletRequest request, boolean lock) {
        var session = request.getSession(false);
        if (session == null || !(session.getAttribute("visitorId") instanceof String id)) return null;
        var rows = db.query("SELECT * FROM visitor_entries WHERE id = ? AND entered_at >= ?" + (lock ? " FOR UPDATE" : ""),
                (rs, row) -> new Visitor(id, rs.getString("email"), rs.getLong("entered_at"), rs.getBoolean("tracking")),
                id, System.currentTimeMillis() - RETENTION);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Map<String, Boolean> state(Visitor visitor) {
        return state(visitor != null && !visitor.email.isEmpty(), visitor != null && visitor.tracking);
    }

    private Map<String, Boolean> state(boolean entered, boolean tracking) {
        return Map.of("entered", entered, "tracking", tracking, "welcomeEnabled", welcome.enabled());
    }
}

@Service
class Welcome {
    private final JdbcTemplate db;
    private final JavaMailSender mail;
    private final String sender;
    private final boolean enabled;
    private final TransactionTemplate transactions;

    Welcome(JdbcTemplate db, JavaMailSender mail, PlatformTransactionManager manager,
            @Value("${spring.mail.username}") String sender, @Value("${spring.mail.password}") String password) {
        this.db = db;
        this.mail = mail;
        this.sender = sender;
        this.enabled = !sender.isBlank() && !password.isBlank();
        this.transactions = new TransactionTemplate(manager);
    }

    boolean enabled() {
        return enabled;
    }

    void send(String email) {
        try {
            String key = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(email.getBytes(StandardCharsets.UTF_8)));
            long now = System.currentTimeMillis();
            Boolean claimed = transactions.execute(status -> {
                db.queryForObject("SELECT name FROM store_documents WHERE name = 'orders' FOR UPDATE", String.class);
                Integer sentToday = db.queryForObject("SELECT count(*) FROM welcome_delivery WHERE attempted_at >= ?", Integer.class, now - 86_400_000);
                if (sentToday != null && sentToday >= 90) return false;
                var existing = db.queryForList("SELECT sent, attempted_at FROM welcome_delivery WHERE email_hash = ?", key);
                if (existing.isEmpty()) {
                    db.update("INSERT INTO welcome_delivery(email_hash, attempted_at) VALUES (?, ?)", key, now);
                    return true;
                }
                return db.update("UPDATE welcome_delivery SET attempted_at = ? WHERE email_hash = ? AND sent = FALSE AND attempted_at < ?",
                        now, key, now - 86_400_000) == 1;
            });
            if (!Boolean.TRUE.equals(claimed)) return;
            var message = mail.createMimeMessage();
            var helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(sender, "SABOTZ Clothing & Supply");
            helper.setTo(email);
            helper.setSubject("Welcome to SABOTZ");
            helper.setText("""
                    Welcome to SABOTZ.

                    Thanks for stopping by. Explore our selection of sneakers, clothing and accessories.
                    Find us on Instagram at @sabotz.clothing.

                    If you did not enter your email on our website, you can ignore this message.
                    """, """
                    <div style="background:#111;color:#fff;padding:32px;font-family:Arial,sans-serif">
                      <strong>SABOTZ.</strong><h1>Welcome to SABOTZ.</h1>
                      <p>Thanks for stopping by. Explore our selection of sneakers, clothing and accessories.</p>
                      <p>Find us on <a href="https://www.instagram.com/sabotz.clothing/" style="color:#fff">Instagram</a>.</p>
                      <p>If you did not enter your email on our website, you can ignore this message.</p>
                    </div>
                    """);
            mail.send(message);
            db.update("UPDATE welcome_delivery SET sent = TRUE WHERE email_hash = ?", key);
        } catch (Exception error) {
            LoggerFactory.getLogger(Welcome.class).warn("Welcome email failed ({})", error.getClass().getSimpleName());
        }
    }
}
