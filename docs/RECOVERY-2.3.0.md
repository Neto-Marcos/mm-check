# Recuperação da produção 2.3.0

Este marco preserva o frontend extraído do artefato que estava implantado em produção antes da evolução empresarial 3.0. O código base veio do último commit rastreado e os arquivos diferentes do frontend foram substituídos pelas cópias exatas recuperadas do JAR.

## Evidências

- versão compilada confirmada em `br.com.mncheck.AppInfo`: `2.3.0`;
- SHA-256 do JAR recuperado: `EB00FB9ABF209004BC12E5A438EA20CDAF75AD62BD67004D3C4FB1FD82470FEF`;
- diretório externo de recuperação: `work/recovery-2.3.0`;
- tag: `v2.3.0-recovered`.

O JAR binário não foi adicionado ao histórico Git para evitar inflar permanentemente o repositório. Ele deve ser guardado junto ao backup externo da implantação anterior.
