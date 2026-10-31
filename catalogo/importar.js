
const fs = require("node:fs");
const path = require("node:path");

async function testarConexao() {
  const arquivo = path.join(__dirname, "albuns.json");
  const dados = JSON.parse(fs.readFileSync(arquivo, "utf8"));

  for (const album of dados.albuns) {
    console.log("\nSABOTZ — TESTE DE CONEXÃO");
    console.log("Álbum:", album.nome);

    try {
      const resposta = await fetch(album.url, {
        signal: AbortSignal.timeout(15000)
      });

      console.log("Status HTTP:", resposta.status);

      if (!resposta.ok) {
        console.log("O site não permitiu o acesso nesta tentativa.");
        continue;
      }

      const html = await resposta.text();

      console.log("Conexão realizada!");
      console.log("HTML recebido:", html.length, "caracteres");
      
const imagens = [
  ...html.matchAll(/https?:\/\/[^"'\s<>]+?\.(?:jpg|jpeg|png|webp)/gi)
].map(resultado => resultado[0]);

const unicas = [...new Set(imagens)];

console.log("URLs de imagens encontradas:", unicas.length);
console.log("Primeiras imagens:", unicas.slice(0, 5));

const fotosYupoo = unicas.filter(url =>
  url.includes("photo.yupoo.com/ovosneaker/")
);

console.log("Imagens do fornecedor:", fotosYupoo.length);
console.log("Exemplos:", fotosYupoo.slice(0, 10));

const idsDasFotos = fotosYupoo
  .map(url => {
    const partes = new URL(url).pathname.split("/");
    return partes[2];
  })
  .filter(Boolean);

const fotosUnicas = [...new Set(idsDasFotos)];

console.log("Fotos únicas encontradas:", fotosUnicas.length);
console.log("Identificadores:", fotosUnicas);

const listaDeFotos = fotosUnicas.map(id => {
  const foto = fotosYupoo.find(url =>
    url.includes("/" + id + "/")
  );

  return {
    id: id,
    url: foto
  };
});

fs.writeFileSync(
  path.join(__dirname, "fotos-teste.json"),
  JSON.stringify(listaDeFotos, null, 2),
  "utf8"
);

console.log("Arquivo fotos-teste.json criado!");




    } catch (erro) {
      console.log("Não foi possível acessar o álbum.");
      console.log("Motivo:", erro.message);
    }
  }
}

testarConexao();
