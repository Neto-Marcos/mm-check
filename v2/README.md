# MN Check v2

Reestruturação do zero do MN Check em TypeScript, cobrindo **contagem de
estoque**, **separação por coletor** e **conferência de expedição**.

O sistema v1 (Java + Spring, na raiz do repositório) continua intacto e
rodando. Esta pasta é independente.

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| App | Next.js 15 (App Router) | Front e back numa linguagem só, sem API separada |
| Linguagem | TypeScript | Tipos compartilhados entre servidor e cliente |
| Banco | PostgreSQL via Prisma | Schema versionado, queries tipadas |
| Auth | Sessão em banco + bcrypt | Sobrevive a restart, senha com KDF |
| PDF | `unpdf` | Extração de texto sem dependência nativa |
| Testes | Vitest | Domínio puro coberto sem subir banco |

## O que mudou em relação ao v1

Cada item abaixo corresponde a um problema real da versão anterior.

**Estado relacional, não um blob JSON.** O v1 mantinha usuários, mapas,
contagens e histórico num objeto em memória, serializado inteiro para uma
única linha (`mn_check_state`) a cada mutação. Dois operadores agindo ao mesmo
tempo se sobrescreviam sem erro. Aqui cada entidade tem tabela própria e cada
escrita toca só as linhas que mudaram.

**Trava otimista na contagem.** `CountSession.version` é enviado pelo cliente
no save. Se o banco já avançou, a resposta é `409` e o operador recarrega —
em vez de apagar o trabalho de outro.

**Sessão persistida.** O v1 guardava tokens num `HashMap` estático: todo
restart do container deslogava todo mundo no meio da separação. Agora a sessão
vive na tabela `sessions`.

**Senha com bcrypt (custo 12).** O v1 usava SHA-256 puro, sem salt.

**Upload binário.** O PDF de saldo chega por `multipart/form-data`. O v1
recebia base64 dentro de JSON, inflando um arquivo de 25 MB para ~33 MB de
string em memória.

**Respostas enxutas.** Cada endpoint devolve o que mudou. O v1 respondia com
o estado inteiro do sistema a cada requisição.

**Snapshot de saldo na contagem.** Ao abrir uma contagem, o saldo é
materializado em `count_items`. Um import novo no meio do processo não muda
mais a base de comparação.

**Toda leitura auditada.** Cada bipada — aceita ou recusada — vira uma linha
imutável em `scans`, com o motivo da recusa.

**Catálogo em cache no processo.** A validação de leitura é o caminho mais
quente do sistema: cada peça passa por ele duas vezes, na separação e na
conferência. O catálogo fica indexado em memória e é invalidado a cada import.

## Duas correções descobertas na validação com o PDF real

**O código de barras não tem largura fixa.** Ele é a concatenação
`Cod Produto + Grade X + Grade Y` como sai no relatório. Como o produto tem 4
ou 5 dígitos e a Grade X vai de 1 a 4, o código real varia de 6 a 10 dígitos:

| Dígitos | Variantes |
|---|---|
| 6 | 6 |
| 7 | 205 |
| 8 | 13 |
| 9 | 14 |
| 10 | 13 |

A v1 assumia 7 dígitos fixos (5 + 1 + 1) e por isso lia **205 de 251
variantes — 82% do catálogo**. As outras 46 recebiam "Código inválido" no
coletor. Na v2 o código é uma **chave**, resolvida por lookup no catálogo, não
uma estrutura fatiada por posição — que aliás seria ambígua, já que `1191`+`3`
e `119`+`13` produzem a mesma string. Códigos com mais de um candidato são
recusados como ambíguos, nunca adivinhados.

**O grão é a variante, não o modelo.** A v1 somava as grades de um mesmo
produto num SKU só. Num CD de linha branca isso deixa uma falta de 220V ser
mascarada por uma sobra de 127V do mesmo modelo. A v2 conta as 251 variantes
separadamente.

## Regras de negócio preservadas do v1

Portadas deliberadamente, com teste cobrindo cada uma:

- Tabela de voltagem da Grade Y: `0` e `4` → Bivolt, `1` e `3` → 127V,
  `2` → 220V. A comparação é pela voltagem **resolvida**, não pelo dígito.
- Exceção de catálogo: o produto `75480-1.2` tem código `7548143`.
- Saldo do PDF resolvido por `Total ÷ Custo Médio`, aceito só se reconstruir o
  total com erro ≤ R$ 0,02.
- Produtos ausentes de um import novo ficam inativos, nunca são apagados.
- Grade Y só aceita valores de 0 a 4; códigos `9999999*` são lixo de cabeçalho.

## Como o PDF de saldo é lido

Layout real do relatório `15581.2 - Saldo Produto Filial`:

```text
Cod Filial | Cod Produto | Grade X | Grade Y | Produto | Saldo | Custo | Total
281          1191          3         1         FERRO…    207     66,99   13866,93
```

Duas armadilhas definem todo o desenho do parser:

1. **O saldo sai colado no fim da descrição** — em 251 de 251 linhas do
   relatório real. `...VFA` + `207` vira `VFA207`, sem separador. Não existe
   forma de fatiar a linha só por espaço em branco.
2. **`Total ÷ Custo Médio` reconstrói o saldo e se auto-verifica.** É a fonte
   primária. O saldo assim obtido é usado para descolar a descrição: removemos
   seu sufixo do fim do texto. Se o sufixo não bater, a linha é marcada como
   não reconciliada e o import inteiro é recusado — em vez de entrar saldo
   errado sem ninguém perceber.

## Estrutura

```text
v2/
├── prisma/
│   ├── schema.prisma        # modelo de dados
│   └── seed.ts              # admin inicial
├── src/
│   ├── domain/              # regras puras, sem I/O — o núcleo testável
│   │   ├── barcode.ts       # resolução de código, voltagem, catálogo
│   │   ├── balance-pdf.ts   # parser do relatório de saldo
│   │   └── counting.ts      # divergência, snapshot, consolidação
│   ├── lib/                 # infraestrutura: db, auth, catálogo, erros HTTP
│   ├── app/
│   │   ├── api/             # endpoints
│   │   ├── contagem/        # tela de contagem
│   │   ├── separacao/       # fila de separação
│   │   └── conferencia/     # fila de conferência
│   └── components/          # scanner e fila de mapas
└── tests/
    ├── fixtures/saldo.pdf   # relatório real de produção
    └── *.test.ts            # 53 testes
```

A regra que sustenta o desenho: **`src/domain` não importa nada de `src/lib`
nem do Prisma.** São funções puras, o que as torna testáveis sem banco e
reutilizáveis no cliente — a prévia de divergência na tela usa exatamente a
mesma função que o servidor usa para gravar.

## Rodando

```bash
cd v2
npm install
cp .env.example .env          # configure DATABASE_URL e MNCHECK_ADMIN_PASSWORD
npx prisma db push            # cria o schema
npm run db:seed               # cria o usuário admin
npm run dev
```

Acesse `http://localhost:3000`.

## Testes

```bash
npm test          # 53 testes: domínio + integração contra o PDF real
npx tsc --noEmit  # tipos
npm run build     # build de produção
```

O teste de integração (`tests/balance-pdf.integration.test.ts`) roda contra o
relatório de produção e só passa se a leitura estiver correta de ponta a
ponta. A asserção mais forte é a soma dos saldos: **31.699** é o `Total Geral`
impresso no rodapé do próprio PDF, então bater esse número prova que nenhuma
linha foi perdida, duplicada ou lida com o saldo errado. Também verifica que a
descrição sai idêntica entre variantes do mesmo produto — se o saldo tivesse
sido descolado no ponto errado, elas divergiriam.

## Perfis

| Perfil | Acesso |
|---|---|
| `ADMIN` | tudo |
| `STOCK` | contagem e import de saldo |
| `SEPARATION` | criação de mapas e separação |
| `EXPEDITION` | conferência de expedição |

## Pendente

Não entrou nesta fase, por decisão de escopo:

- Mapas de carga por PDF/imagem com extração por IA (o v1 tem isso).
- Rotas de entrega.
- Tela de administração de usuários (o seed cria o admin; demais usuários
  ainda precisam ser criados via banco).
- Painel de divergências — os dados já são gravados, falta a tela.
- Criação de mapa pela interface (o endpoint existe).
- Fila de leitura offline no coletor, para o Wi-Fi de doca.
- Service worker / uso offline.
