FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /src
COPY backend/pom.xml backend/pom.xml
COPY backend/src backend/src
COPY frontend/public/data/products.json frontend/public/data/products.json
COPY frontend/public/assets/images frontend/public/assets/images
COPY frontend/data/site-settings.json frontend/data/orders.json frontend/data/
RUN mvn -B -f backend/pom.xml package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/backend/target/store-backend-1.0.0.jar /app/store.jar
USER 10001:10001
ENTRYPOINT ["java", "-jar", "/app/store.jar"]
