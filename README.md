# SABOTZ Store

O site usa Angular no frontend e um servidor Node/Express para autenticar o admin e salvar alterações no catálogo. O layout da loja e as páginas anteriores foram preservados como referência em `archive/legacy-static/`.

## Rodar localmente

Requisitos: Node.js 22.22.3 ou mais recente e npm.

1. Abra o PowerShell dentro de `frontend/`.
2. Instale as dependências (necessário na primeira execução):

   ```powershell
   npm install
   ```

3. Inicie o frontend e a API juntos:

   ```powershell
   npm start
   ```

   Na primeira execução, o projeto cria `frontend/.env` com as credenciais locais de desenvolvimento: usuário `sabotz` e senha `admin`. O arquivo `.env` não é enviado ao Git. Essas credenciais padrão são somente para desenvolvimento local; defina credenciais fortes antes de qualquer implantação.

4. Abra <http://localhost:4200> para visitar a loja. Para gerenciar o catálogo e consultar **Visitor activity**, acesse <http://localhost:4200/admin> e entre com as credenciais do ADMIN.

Encerre com `Ctrl+C`. Os produtos são gravados em `frontend/public/data/products.json`. O preço é informado em libras esterlinas (GBP, £). No painel, escolha imagens JPG, PNG, WebP ou GIF de até 5 MB; elas são pré-visualizadas e enviadas ao servidor ao salvar. As imagens ficam em `frontend/public/assets/images/uploads/`.

## Testar no telefone

Conecte o telefone ao Wi-Fi do mesmo roteador do computador (o computador pode estar conectado por cabo). Encerre a execução anterior com `Ctrl+C` e, dentro de `frontend/`, execute:

```powershell
npm.cmd run start:lan
```

No navegador do telefone, abra `http://IP-DO-COMPUTADOR:4200`. Use `ipconfig` no computador para encontrar o IPv4 do adaptador conectado ao roteador. O endereço pode mudar ao reconectar a rede. Se o Windows pedir acesso à rede, permita apenas em redes privadas de confiança. Mantenha o computador ligado e o terminal aberto. As chamadas de API e as imagens enviadas pelo ADMIN passam pelo proxy do frontend; não é necessário expor a porta 3000 nem alterar o CORS.

## Página inicial

`LATEST ARRIVALS` apresenta os quatro primeiros produtos do catálogo, na ordem da API (os novos cadastros entram no início). `SABOTZ SELECTION` começa com três produtos selecionados pelos slugs em `HomePage.selectedProducts`, em `frontend/src/app/pages/home/home.ts`. Produtos removidos e categorias marcadas como `COMING SOON` não aparecem nessas vitrines. `EXPLORE ALL` abre `/collection`, que reutiliza o catálogo e seus filtros. Textos fixos do site e do ADMIN estão em inglês; nomes e descrições cadastrados continuam sob controle do administrador.

## Produção

A janela de boas-vindas oferece e-mail e cookies de análise opcionais. O painel **Visitor activity** mostra as entradas com e-mail e as visitas anônimas que aceitaram análise, com páginas abertas e tempo visível quando autorizado. Os registros ficam em `frontend/data/visitors.sqlite`, fora do Git. Em produção, defina `VISITOR_DB_PATH` para um arquivo em armazenamento persistente e privado.

Para enviar **Welcome to SABOTZ**, configure `WELCOME_GMAIL_USER` e `WELCOME_GMAIL_APP_PASSWORD` no `frontend/.env` local ou nos segredos da hospedagem. Use uma senha de app criada na conta Google da loja e reinicie o servidor. O envio exige acesso SMTP ao Gmail. A entrada no catálogo funciona enquanto o envio estiver desativado.

Crie as variáveis de ambiente `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `SESSION_SECRET` (com pelo menos 32 caracteres aleatórios), defina `NODE_ENV=production`, gere a aplicação com `npm run build` e inicie o servidor com `npm run start:production`. O servidor entrega o frontend compilado e a API na mesma origem.

O servidor de sessão padrão guarda sessões em memória. Isso atende ao uso local de uma única instância; em produção com reinícios ou múltiplas instâncias, configure um armazenamento persistente de sessões. A hospedagem também precisa de HTTPS e armazenamento persistente para o arquivo do catálogo.
