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

## Regras de negócio preservadas do v1

Foram portadas deliberadamente, com teste cobrindo cada uma:

- CODE 128 de 7 dígitos: SKU (5) + cor (1) + voltagem (1).
- Tabela de voltagem: `0` e `4` → Bivolt, `1` e `3` → 127V, `2` → 220V.
  A comparação é pela voltagem **resolvida**, não pelo dígito — dois códigos
  diferentes podem significar a mesma voltagem.
- Exceção de catálogo: o SKU `75480-1.2` tem código de barras `7548143`.
- Saldo do PDF resolvido por `Total ÷ Custo Médio`, com prioridade sobre o
  texto da coluna Saldo, aceito só se reconstruir o total com erro ≤ R$ 0,02.
- SKUs repetidos no PDF têm o saldo somado.
- Produtos ausentes de um import novo ficam inativos, nunca são apagados.
- Grade Y só aceita valores de 0 a 4; códigos `9999999*` são lixo de cabeçalho.

## Estrutura

```text
v2/
├── prisma/
│   ├── schema.prisma        # modelo de dados
│   └── seed.ts              # admin inicial
├── src/
│   ├── domain/              # regras puras, sem I/O — o núcleo testável
│   │   ├── barcode.ts       # CODE 128, voltagem, validação de leitura
│   │   ├── balance-pdf.ts   # parser do relatório de saldo
│   │   └── counting.ts      # divergência, snapshot, consolidação
│   ├── lib/                 # infraestrutura: db, auth, erros HTTP
│   ├── app/
│   │   ├── api/             # endpoints
│   │   ├── contagem/        # tela de contagem
│   │   ├── separacao/       # fila de separação
│   │   └── conferencia/     # fila de conferência
│   └── components/          # scanner e fila de mapas
└── tests/                   # 34 testes de domínio
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
npm test          # domínio (34 testes, não precisa de banco)
npx tsc --noEmit  # tipos
npm run build     # build de produção
```

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
- Service worker / uso offline.
