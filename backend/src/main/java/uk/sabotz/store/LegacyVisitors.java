package uk.sabotz.store;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;

@Component
class LegacyVisitors implements ApplicationRunner {
    private final JdbcTemplate db;
    private final String source;

    LegacyVisitors(JdbcTemplate db, @Value("${LEGACY_VISITOR_DB:}") String source) {
        this.db = db;
        this.source = source;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void run(ApplicationArguments args) throws Exception {
        if (source.isBlank()) return;
        db.queryForObject("SELECT name FROM store_documents WHERE name = 'orders' FOR UPDATE", String.class);
        if (Boolean.TRUE.equals(db.queryForObject("""
                SELECT count(*) > 0 FROM store_documents WHERE name = 'legacy-visitors-imported'
                """, Boolean.class))) return;
        Path file = Path.of(source).toAbsolutePath();
        if (!Files.isRegularFile(file)) throw new IllegalArgumentException("LEGACY_VISITOR_DB does not point to a SQLite file.");
        long cutoff = System.currentTimeMillis() - 90L * 86_400_000;
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + file.toUri().toASCIIString() + "?mode=ro");
             var query = connection.prepareStatement("SELECT id, email, entered_at, tracking FROM visitor_entries WHERE entered_at >= ?");
             var views = connection.prepareStatement("""
                     SELECT p.visitor_id, p.view_id, p.path, p.opened_at, p.seconds FROM page_visits p
                     JOIN visitor_entries v ON v.id = p.visitor_id WHERE v.entered_at >= ?
                     """);
             var delivery = connection.prepareStatement("SELECT email_hash, attempted_at, sent FROM welcome_delivery WHERE attempted_at >= ?")) {
            query.setLong(1, cutoff);
            try (var rows = query.executeQuery()) {
                while (rows.next()) {
                    String id = rows.getString(1);
                    db.update("""
                            INSERT INTO visitor_entries(id, email, entered_at, tracking)
                            SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM visitor_entries WHERE id = ?)
                            """, id, rows.getString(2), rows.getLong(3), rows.getBoolean(4), id);
                }
            }
            views.setLong(1, cutoff);
            try (var rows = views.executeQuery()) {
                while (rows.next()) {
                    String id = rows.getString(1);
                    String view = rows.getString(2);
                    db.update("""
                            INSERT INTO page_visits(visitor_id, view_id, path, opened_at, seconds)
                            SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS
                            (SELECT 1 FROM page_visits WHERE visitor_id = ? AND view_id = ?)
                            """, id, view, rows.getString(3), rows.getLong(4), rows.getInt(5), id, view);
                }
            }
            delivery.setLong(1, cutoff);
            try (var rows = delivery.executeQuery()) {
                while (rows.next()) {
                    String hash = rows.getString(1);
                    db.update("""
                            INSERT INTO welcome_delivery(email_hash, attempted_at, sent)
                            SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM welcome_delivery WHERE email_hash = ?)
                            """, hash, rows.getLong(2), rows.getBoolean(3), hash);
                }
            }
        }
        db.update("INSERT INTO store_documents(name, content) VALUES ('legacy-visitors-imported', '{}')");
    }
}
