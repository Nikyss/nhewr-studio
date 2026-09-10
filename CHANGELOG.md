# Histórico de Versões

## V1.0.3 · 10/09/2026

### Novidades

- Nova aba Melhorar qualidade usando jSquash/Squoosh em WebAssembly: ampliação 1×, 2× e 4×, suavização de contornos, Lanczos 3 e Magic Kernel.
- Modo Preservar RGB para ícones com cores obrigatórias. Suaviza o alfa e conserva as cores dos pixels, inclusive durante ampliação e redimensionamento combinados.
- Processamento de qualidade em Web Worker, com cancelamento de resultados antigos, limites de tamanho e ajustes independentes por arquivo.
- O botão Abrir ícone de exemplo usa a mascote PNG original do Nhewr Studios, com transparência, sem redesenhar nem recomprimir o anexo.
- Transparência reorganizada em remoção por cor, visibilidade do ícone e fundo do arquivo. Novo controle de suavização do recorte.
- Remoção por cor agora começa em 0% e altera o alfa gradualmente até 100%, sem apagar imediatamente ao capturar a cor.
- Até 16 trocas de cor podem ser fixadas, editadas e removidas por imagem; começar uma nova captura preserva a troca anterior.
- Nova padronização de tons próximos reduz variações HEX pequenas e mantém cores claramente diferentes.
- Menos contornos decorativos nas prévias, seções de ajustes, botões secundários e itens selecionados. Temas neutros claro e escuro preservados.

### Correções Incluídas

- PNG agora é lido, amostrado e gravado a partir dos canais RGBA, sem usar a imagem de apresentação do canvas como fonte. Evita arredondamento de RGB em pixels semitransparentes.
- Testes de ida e volta garantem #FCAEE3 e #FF7020 exatos em PNG, incluindo alfa de 1 a 255.
- Copiar a cor original para a nova cor usa o valor literal do campo.
- Inspeção RGB opaca apenas na prévia, sem alterar a transparência exportada.
- Layout adaptável a janelas estreitas; zoom mantém a imagem centrada ao redimensionar a janela. Rolagem por toque disponível fora da captura.
- Restaurar Transparência ou Qualidade não apaga ajustes das outras ferramentas.
- Ampliação combinada com tamanho personalizado faz uma só reamostragem, evitando perda intermediária de cor no modo RGB protegido.

### Distribuição e Verificação

- ZIP Windows com interface pronta, INICIAR.bat atualizado, documentação e arquivo SHA-256. Node.js portátil automático quando necessário, sem conta e sem envio de imagens.
- Suíte automatizada cobre PNG/alfa, formatos de cor, remoção gradual, múltiplas trocas, padronização, ampliação, limites, cancelamento, edição independente, exportação e servidor local.
- Verificações de navegador incluem exemplo PNG, ferramentas, exportação e layout em diferentes larguras.

### Limitações Importantes

- Ampliação por reamostragem, sem IA: não recria detalhes ausentes nem substitui um original vetorial.
- Suavização do alfa pode tornar traços finos menos opacos. RGB protegido não mistura fronteiras internas entre cores.
- Interpolação, nitidez, filtros e fundo preenchido podem gerar outras cores. Extensões de captura podem medir a mistura com o fundo, não o RGB armazenado.
- PNG de 16 bits é normalizado para 8 bits na importação. Imagens e histórico permanecem apenas na sessão.

## V1.0.2

- Tema claro branco e modo escuro neutro.
- Edição independente de várias imagens e exportação ZIP com seleção de arquivos.
- HEX, RGB, RGBA e ARGB; PNG com transparência por padrão.
- Zoom independente por prévia e cursor de seta na leitura de pixels.
- Distribuição local para Windows com inicializador automático.

A versão pública segue de V1.0.2 para V1.0.3.
