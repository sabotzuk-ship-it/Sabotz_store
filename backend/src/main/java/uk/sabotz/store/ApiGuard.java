package uk.sabotz.store;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;

@Component
class ApiGuard implements HandlerInterceptor, WebMvcConfigurer {
    private final ObjectMapper mapper;

    ApiGuard(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    static boolean admin(HttpServletRequest request) {
        var session = request.getSession(false);
        return session != null && Boolean.TRUE.equals(session.getAttribute("admin"));
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(this).addPathPatterns("/api/admin/**", "/api/visitors/**");
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
        response.setHeader("Cache-Control", "no-store");
        String path = request.getServletPath();
        if (!request.getMethod().equals("GET") && !request.getMethod().equals("HEAD")
                && !"XMLHttpRequest".equals(request.getHeader("X-Requested-With"))) {
            return reject(response, 403, "The request could not be verified.");
        }
        if (path.startsWith("/api/admin/") && !path.equals("/api/admin/login") && !admin(request)) {
            return reject(response, 401, "Admin login required.");
        }
        return true;
    }

    private boolean reject(HttpServletResponse response, int status, String error) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        mapper.writeValue(response.getOutputStream(), Map.of("error", error));
        return false;
    }
}

@RestController
class AdminSession {
    private final String username;
    private final String password;
    private final AttemptLimit attempts = new AttemptLimit(5, 900_000);

    AdminSession(@Value("${sabotz.admin.username}") String username, @Value("${sabotz.admin.password}") String password) {
        if (username.isBlank() || password.isBlank()) throw new IllegalArgumentException("Set ADMIN_USERNAME and ADMIN_PASSWORD.");
        this.username = username;
        this.password = password;
    }

    @PostMapping("/api/admin/login")
    Map<String, Boolean> login(@RequestBody JsonNode body, HttpServletRequest request) {
        String address = request.getRemoteAddr();
        if (!attempts.claim(address)) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many login attempts. Try again in 15 minutes.");
        if (!matches(username, body.path("username")) || !matches(password, body.path("password"))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password.");
        }
        attempts.clear(address);
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        request.getSession().setAttribute("admin", true);
        return session();
    }

    @GetMapping("/api/admin/session")
    Map<String, Boolean> session() {
        return Map.of("authenticated", true);
    }

    @PostMapping("/api/admin/logout")
    Map<String, Boolean> logout(HttpServletRequest request) {
        request.getSession(false).invalidate();
        return Map.of("authenticated", false);
    }

    private boolean matches(String expected, JsonNode supplied) {
        return supplied.isTextual() && MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                supplied.textValue().getBytes(StandardCharsets.UTF_8));
    }
}

final class AttemptLimit {
    private record Window(long expires, int count) {}
    private final Map<String, Window> windows = new HashMap<>();
    private final int limit;
    private final long duration;
    private long nextCleanup;

    AttemptLimit(int limit, long duration) {
        this.limit = limit;
        this.duration = duration;
    }

    synchronized boolean claim(String address) {
        long now = System.currentTimeMillis();
        if (now >= nextCleanup) {
            windows.values().removeIf(window -> window.expires() <= now);
            nextCleanup = now + duration;
        }
        Window current = windows.get(address);
        if (current == null || current.expires() <= now) current = new Window(now + duration, 0);
        if (current.count() >= limit) return false;
        windows.put(address, new Window(current.expires(), current.count() + 1));
        return true;
    }

    synchronized void clear(String address) {
        windows.remove(address);
    }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ResponseStatusException.class)
    org.springframework.http.ResponseEntity<Map<String, String>> status(ResponseStatusException error) {
        return org.springframework.http.ResponseEntity.status(error.getStatusCode())
                .body(Map.of("error", error.getReason() == null ? "The request could not be completed." : error.getReason()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    org.springframework.http.ResponseEntity<Map<String, String>> tooLarge() {
        return org.springframework.http.ResponseEntity.status(413).body(Map.of("error", "Maximum upload size is 5 MB per image."));
    }
}
