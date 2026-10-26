# Conceitos do módulo 2, explicados pelo código

Guia de estudo em português: APIs de LLM e engenharia de prompt. Cada conceito aponta para o arquivo onde ele acontece.

## 1. Como uma API de LLM funciona

Você manda um pedido HTTP com instruções e conteúdo; o modelo devolve texto. Não há memória entre chamadas: cada pedido leva tudo o que o modelo precisa saber (veja `src/providers/gemini.ts`).

As peças de um pedido:

| Peça | Para que serve | Neste projeto |
| --- | --- | --- |
| `model` | Qual modelo responde | `gemini-3.8-flash`, `gemini-3.5-flash-lite`... |
| `system_instruction` | Quem o modelo é e as regras do jogo. Vale para a conversa inteira | A seção `# system` de cada prompt |
| `input` | O conteúdo da vez: texto, imagem, áudio | Ficha técnica + foto |
| `response_format` | Obriga a resposta a seguir um formato | O JSON Schema do produto |

**Multimodal:** a foto vai no mesmo pedido que o texto, como um bloco `image` em base64. O modelo "vê" a imagem e o texto juntos.

## 2. Tokens e custo

O modelo não lê letras nem palavras, lê **tokens** (pedaços de palavras; em português, em média 1 token ≈ 3 a 4 caracteres). Você paga por token:

- **Entrada:** tudo que você manda (prompt, ficha, imagem). Uma imagem também vira tokens.
- **Saída:** o que o modelo escreve. Costuma custar 4 a 8 vezes mais que a entrada.
- **Pensamento (thinking):** modelos que "raciocinam" antes de responder gastam tokens que você não vê, mas paga como saída.

Por isso `src/cost.ts` soma `thoughtTokens` ao custo de saída. Um modelo com preço por token menor pode sair mais caro se pensar muito. Só medindo para saber.

A métrica que um negócio entende é **custo por 1.000 produtos**, não custo por token.

## 3. Saída estruturada (structured output)

Pedir "responda em JSON" no texto funciona *quase* sempre, e "quase" não serve para produção. Com `response_format` + JSON Schema, a API restringe a geração ao formato pedido.

Mas atenção (veja `src/copy-schema.ts`): o Gemini **ignora** algumas regras do schema, como `maxLength`. Por isso o mesmo schema Zod valida a resposta de novo aqui. Regra de ouro: **nunca confie na saída do modelo sem validar no seu código.**

Detalhe útil: as `describe()` de cada campo do Zod viram texto no JSON Schema, e o modelo lê. Elas fazem parte do prompt.

## 4. Engenharia de prompt na prática

Compare os três arquivos em `prompts/`:

- **v1-baseline:** "Você é um redator. Escreva sobre este produto." Funciona, mas o modelo preenche lacunas com o que parece plausível. Isso é **alucinação**.
- **v2-grounded:** explica *quem lê* e *por que* a precisão importa (texto publicado sem revisão, risco de reclamação e Código de Defesa do Consumidor). Depois vêm as regras. Dar o motivo de cada regra ajuda o modelo a generalizar para casos que a regra não previu.
- **v3-few-shot:** v2 + um exemplo completo. **Few-shot** é ensinar mostrando. Repare que o exemplo usa um produto *fora* do catálogo, para o modelo aprender o padrão sem copiar o conteúdo.

**Grounding** (ancoragem) é a ideia central: o modelo só pode afirmar o que está numa fonte que você forneceu. É o mesmo princípio do RAG (módulo 6), só que aqui a fonte é a ficha técnica.

**Prompts versionados:** prompt é código. Cada versão é um arquivo novo, com hipótese registrada em `prompts/CHANGELOG.md`, para você sempre saber qual texto gerou qual resultado.

## 5. Reduzindo alucinações

Técnicas usadas aqui:

1. **Fonte única de verdade:** "use somente fatos da ficha técnica".
2. **Válvula de escape:** o campo `missingInfo`. Se o modelo não tem onde colocar a dúvida, ele tende a inventar uma resposta. Com um lugar legítimo para "não sei", inventa menos.
3. **Separar fontes por tipo de informação:** a foto vale para cor e formato, nunca para material ou medida.
4. **Verificação automática:** `src/checks.ts` confere se cada número do texto existe na ficha, se algum material foi inventado e se alguma garantia foi criada do nada.

## 6. Erros e novas tentativas (retries)

Dois tipos de falha, dois tratamentos (veja `src/generate.ts`):

| Falha | Causa | O que fazer |
| --- | --- | --- |
| HTTP 429 / 503 | Limite de requisições ou servidor sobrecarregado | Esperar e repetir igual (*exponential backoff*: 2 s, 4 s, 8 s...) |
| Resposta inválida | O modelo errou o formato ou estourou um limite | Repetir **contando o erro**: "sua resposta foi rejeitada por X, corrija" |
| Chave inválida | Configuração errada | Não repetir: parar e avisar |

Repetir sem informar o erro tende a gerar o mesmo erro. Informar o erro é uma forma simples de **prompt chaining**: a saída de uma chamada vira entrada da próxima.

### Lição aprendida na prática: cota diária

Na primeira execução real, o benchmark não gerou nenhum texto. O plano gratuito permite cerca de **20 requisições por modelo por dia**, e **toda tentativa conta, inclusive as que falham**. O código repetia até 5 vezes cada erro 503 ("alta demanda"), então três chamadas azaradas consumiram a cota do dia inteiro.

O que mudou:

- `429 ... per day` virou um erro próprio (`QuotaExhaustedError`), que **não** é repetido. Esperar 10 segundos não resolve uma cota que só volta amanhã.
- Menos repetições para 503, com esperas maiores (10 s, depois 20 s).
- O SDK também repetia por conta própria, multiplicando as tentativas. Desliguei: quem decide é o nosso código, que conhece o motivo do erro.
- O benchmark ficou **retomável**: salva cada resultado na hora e, na próxima execução, só roda o que falta.

Em entrevista, essa história vale mais que um projeto que "funcionou de primeira": mostra que você entende que **toda nova tentativa tem custo** (dinheiro, cota, latência) e que tratar erros é classificar por causa, não repetir tudo.

## 7. Avaliação (evals)

"Achei que ficou bom" não é métrica. O benchmark (`npm run bench`) roda cada combinação de modelo × prompt sobre os 12 produtos e mede:

- **Válido:** a resposta passou no schema?
- **Todas as checagens:** zero informação inventada?
- **Latência** e **custo por 1.000 produtos**.

As checagens são **determinísticas**: mesma entrada, mesmo resultado, custo zero. Elas não julgam estilo nem persuasão. Para isso existe o *LLM como juiz* (um modelo avaliando outro), que fica para o módulo 10.

## 8. Arquitetura independente de provedor

Todo o código conversa com a interface `LlmProvider` (`src/providers/types.ts`). O Gemini é só um adaptador. Benefícios:

- trocar ou adicionar provedor (Claude, OpenAI) é escrever um arquivo;
- os testes usam um `FakeProvider` (`tests/helpers.ts`) que devolve respostas prontas: rodam sem internet, sem chave e sem custo, inclusive no CI.

Isso é **injeção de dependência**, o mesmo padrão que você usa no front-end para mockar uma API.

## 9. Privacidade

A Interactions API do Gemini **guarda** as conversas no servidor por padrão. O adaptador manda `store: false`, porque não há motivo para o provedor guardar dados do catálogo. Em produção, ler as políticas de retenção de dados do provedor faz parte do trabalho (e conversa com a LGPD, que aparece no módulo 11).

## Exercícios para fixar

1. Rode `npm run generate -- --product tabua-de-corte --prompt v1-baseline` e depois com `v2-grounded`. A tábua não tem material na ficha. Algum dos dois inventou "madeira" ou "bambu"?
2. Crie um `prompts/v4-....md` com uma ideia sua (por exemplo, pedir que o modelo liste os fatos da ficha antes de escrever). Registre a hipótese no CHANGELOG e rode o benchmark só com ele: `npm run bench -- --prompts v2-grounded,v4-...`.
3. Olhe em `results/*.json` os casos que falharam em `numbers-grounded`. Era invenção de verdade, ou a checagem é rígida demais (por exemplo, "2 em 1")? Toda checagem automática tem falsos positivos: decidir o que fazer com eles é trabalho de engenharia.
4. Descubra quantos tokens a foto custa: rode o mesmo produto com e sem imagem e compare `inputTokens`.
