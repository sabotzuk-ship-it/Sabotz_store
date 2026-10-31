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

   Na primeira execução, o projeto cria `frontend/.env` e mostra no terminal o usuário `admin` e uma senha aleatória. Guarde essa senha. O arquivo `.env` não é enviado ao Git.

4. Abra <http://localhost:4200>. Use o link **ADMIN** no rodapé ou acesse <http://localhost:4200/admin>.

Encerre com `Ctrl+C`. Os produtos são gravados em `frontend/public/data/products.json`. O preço é informado em euros. No painel, escolha imagens JPG, PNG, WebP ou GIF de até 5 MB; elas são pré-visualizadas e enviadas ao servidor ao salvar. As imagens ficam em `frontend/public/assets/images/uploads/`.

## Produção

Crie as variáveis de ambiente `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `SESSION_SECRET` (com pelo menos 32 caracteres aleatórios), defina `NODE_ENV=production`, gere a aplicação com `npm run build` e inicie o servidor com `npm run start:production`. O servidor entrega o frontend compilado e a API na mesma origem.

O servidor de sessão padrão guarda sessões em memória. Isso atende ao uso local de uma única instância; em produção com reinícios ou múltiplas instâncias, configure um armazenamento persistente de sessões. A hospedagem também precisa de HTTPS e armazenamento persistente para o arquivo do catálogo.
