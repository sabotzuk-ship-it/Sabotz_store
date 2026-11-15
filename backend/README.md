# Backend SABOTZ

O Angular continua usando as mesmas rotas. O Spring Boot guarda produtos, categorias, pedidos, uploads e dados de visitas no banco. Para desenvolvimento, o banco H2 salva no disco em `backend/data`. Em produção, use PostgreSQL persistente. As fotos enviadas pelo admin ficam na tabela `store_images`, com limite de 5 MB por foto.

## Rodar localmente

Requer Java 17 ou superior e Maven. No primeiro terminal, na raiz do repositório:

```powershell
cd backend
$env:ADMIN_USERNAME = 'admin'
$env:ADMIN_PASSWORD = 'troque-por-uma-senha-forte'
mvn spring-boot:run
```

No segundo terminal, a partir da raiz do repositório:

```powershell
cd frontend
npm.cmd run ng -- serve --proxy-config proxy.conf.json
```

Abra http://localhost:4200/admin. A API usa a porta 3000. Pare o backend Express antes de iniciar o Spring nessa porta.

Para usar o Neon localmente, faça o vínculo pela CLI e rode `neon deploy` ou `neon env pull` na raiz. O Spring lê `DATABASE_URL_UNPOOLED` ou `DATABASE_URL` do ambiente ou do arquivo local criado pela CLI. A conexão direta tem prioridade porque o servidor aplica o esquema ao iniciar. `JDBC_DATABASE_URL` continua disponível para definir a conexão explicitamente no Render.

O primeiro início carrega o catálogo, as categorias e os pedidos dos JSON existentes e importa as fotos de upload vinculadas aos produtos ou categorias. Faça o build a partir da cópia que contém os arquivos atuais da loja. Edições feitas depois ficam no banco. Para importar também o histórico dos últimos 90 dias, pare o Express, faça backup do SQLite e configure `LEGACY_VISITOR_DB` com o caminho absoluto do arquivo antes da primeira inicialização com o banco novo. A importação lê a origem sem alterá-la e roda uma vez por banco.

## Publicar

1. Prepare um PostgreSQL persistente e um serviço Java com URL HTTPS. Gere o pacote da raiz do repositório com `mvn -f backend/pom.xml clean package` e rode `java -jar backend/target/store-backend-1.0.0.jar`.
2. Configure `JDBC_DATABASE_URL` (exemplo `jdbc:postgresql://HOST:5432/sabotz?sslmode=require`), `DATABASE_USER`, `DATABASE_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `SECURE_COOKIES=true` no serviço Java. Para habilitar o e-mail, configure também `WELCOME_GMAIL_USER` e `WELCOME_GMAIL_APP_PASSWORD`. Mantenha essas configurações no provedor, fora do Git.
3. No Vercel, encaminhe `/api/:path*` para `https://SEU-BACKEND/api/:path*` e `/assets/images/uploads/:path*` para `https://SEU-BACKEND/assets/images/uploads/:path*`, antes da regra que serve o Angular. A URL deve ser a do serviço Java publicado. O navegador continua fazendo as chamadas pelo domínio da loja.
4. Antes de divulgar o endereço, confira o login no admin, o envio de uma foto e a exibição do produto na vitrine. Sessões ficam na memória da instância Java. Use uma instância inicialmente e espere novo login após reiniciar. Inclua o banco nos backups da loja.
