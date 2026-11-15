package uk.sabotz.store;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.net.URI;
import java.util.Map;

public class NeonDatabaseEnvironment implements EnvironmentPostProcessor, Ordered {
    @Override
    public int getOrder() {
        return ConfigDataEnvironmentPostProcessor.ORDER + 1;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String configuredUrl = environment.getProperty("spring.datasource.url", "");
        if (configured(environment.getProperty("JDBC_DATABASE_URL")) || configuredUrl.startsWith("jdbc:postgresql:")) return;

        // Startup applies schema.sql using the same Hikari pool as the application.
        String connection = environment.getProperty("DATABASE_URL_UNPOOLED");
        if (!configured(connection)) connection = environment.getProperty("DATABASE_URL");
        if (!configured(connection)) return;

        try {
            URI uri = URI.create(unquote(connection.trim()));
            String credentials = uri.getUserInfo();
            int separator = credentials == null ? -1 : credentials.indexOf(':');
            if (!("postgresql".equals(uri.getScheme()) || "postgres".equals(uri.getScheme()))
                    || uri.getHost() == null || separator <= 0 || separator == credentials.length() - 1
                    || uri.getPath() == null || uri.getPath().length() < 2) throw new IllegalArgumentException();
            String port = uri.getPort() == -1 ? "" : ":" + uri.getPort();
            String jdbcUrl = "jdbc:postgresql://" + uri.getHost() + port + uri.getRawPath()
                    + "?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory";
            environment.getPropertySources().addFirst(new MapPropertySource("neonPostgres", Map.of(
                    "spring.datasource.url", jdbcUrl,
                    "spring.datasource.username", credentials.substring(0, separator),
                    "spring.datasource.password", credentials.substring(separator + 1)
            )));
        } catch (IllegalArgumentException error) {
            throw new IllegalStateException("The Neon database URL is invalid. Refresh it with neon env pull.");
        }
    }

    private static boolean configured(String value) {
        return value != null && !value.isBlank();
    }

    private static String unquote(String value) {
        if (value.length() >= 2 && ((value.startsWith("\"") && value.endsWith("\""))
                || (value.startsWith("'") && value.endsWith("'")))) return value.substring(1, value.length() - 1);
        return value;
    }
}
