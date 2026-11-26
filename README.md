# Turnê do Dia (iPhone e Android)

App de rotina inspirado nas eras da Taylor Swift, com ingressos que calculam a hora de sair, três alarmes por compromisso, folga inteligente contra atrasos, setlist de metas, estúdio de foco, 12 eras com looks e uma coleção de discos.

O mesmo projeto gera os dois instaladores:
- **TurneDoDia.apk** para Android: instala direto, sem conta de desenvolvedor e sem prazo de validade.
- **TurneDoDia.ipa** para iPhone: instala com um Apple ID gratuito e precisa ser renovado a cada 7 dias.

---

## 1. Gerar os instaladores no GitHub (grátis)

1. Crie uma conta em github.com, se ainda não tiver.
2. Clique em **New repository**. Dê o nome `turne-do-dia`, marque **Private** e clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**.
4. Descompacte o zip do projeto no PC. Arraste **todo o conteúdo** da pasta `turne-do-dia` para a página, incluindo a pasta `.github`, e clique em **Commit changes**.
5. Abra a aba **Actions**. Duas compilações começam sozinhas:
   - "Gerar APK (Android)" leva uns 10 a 20 minutos.
   - "Gerar IPA (iOS)" leva uns 15 a 25 minutos.
6. Quando aparecer o ✓ verde, clique na compilação e, em **Artifacts**, baixe **TurneDoDia-apk** ou **TurneDoDia-ipa**.
7. Descompacte o que baixou. Dentro está o instalador.

Se uma compilação ficar vermelha, clique nela, abra o passo que falhou e copie as últimas linhas do erro.

O plano grátis do GitHub, num repositório privado, dá US$ 12 de crédito por mês. Isso cobre umas 8 compilações de iPhone, e as de Android quase não gastam. Se só precisar de um dos dois, abra a compilação que não usa na aba **Actions** e escolha **Disable workflow**.

---

## 2. Android: instalar o APK

### Jeito rápido
1. Mande o **TurneDoDia.apk** para o celular, por exemplo pelo Google Drive ou pelo cabo.
2. Toque no arquivo. Se o Android pedir, permita **Instalar apps desconhecidos** para o app que abriu o arquivo e toque em **Instalar**.
3. Se o Play Protect avisar que o app não é conhecido, toque em **Mais detalhes › Instalar mesmo assim**.

### Se o celular bloquear o app
Desde 30/09/2026, o Google restringe no Brasil apps de desenvolvedores não registrados. Se a instalação for bloqueada, use o cabo com o **ADB**. O Google garante que instalações por ADB continuam liberadas, sem espera.

1. No celular, vá em **Configurações › Sobre o telefone** e toque 7 vezes em **Número da versão**. Isso libera as **Opções do desenvolvedor**.
2. Em **Opções do desenvolvedor**, ative **Depuração USB**. O caminho muda um pouco conforme a marca.
3. No PC, baixe o **SDK Platform-Tools para Windows** em developer.android.com/tools/releases/platform-tools e descompacte.
4. Ligue o celular no cabo e aceite **Permitir depuração USB**.
5. Abra a pasta `platform-tools`, clique com o botão direito num espaço vazio segurando **Shift** e escolha **Abrir janela do PowerShell aqui**.
6. Rode o comando abaixo, trocando o caminho pelo lugar onde está o APK. No fim deve aparecer `Success`.
   ```
   .\adb install -r C:\Users\SeuNome\Downloads\TurneDoDia.apk
   ```

Sem PC, existe o **fluxo avançado** do Google. Em **Opções do desenvolvedor**, ative a opção de permitir apps de desenvolvedores não verificados. O celular reinicia e pede uma espera única de 24 horas. Depois disso, o jeito rápido volta a funcionar.

### Depois de instalar
1. Abra o Turnê do Dia e aceite as notificações. Sem essa permissão, os alarmes não tocam.
2. Em **Configurações › Apps › Turnê do Dia › Bateria**, escolha **Sem restrições**. Alguns celulares (Xiaomi, Samsung, Motorola) fecham apps para poupar bateria e podem atrasar alarmes.
3. Os alarmes de saída tocam no volume de **alarme** do celular, não no de notificação.

### Atualizar
Instale o APK novo por cima, do mesmo jeito (ou com `adb install -r`). Os dados dela continuam: XP, eras, ingressos e foto.

---

## 3. iPhone: instalar o IPA com o Sideloadly

No PC:
1. Instale o **iTunes** e o **iCloud** baixados do site da Apple (apple.com). As versões da Microsoft Store não funcionam com o Sideloadly.
2. Instale o **Sideloadly** pelo site oficial: sideloadly.io.
3. Ligue o iPhone no PC pelo cabo e toque em **Confiar** no iPhone.
4. Abra o Sideloadly e arraste o **TurneDoDia.ipa** para a janela.
5. Em **Apple account**, digite o seu Apple ID e clique em **Start**. Digite a senha e o código de verificação quando pedir.

No iPhone:
6. Vá em **Ajustes › Geral › VPN e Gerenciamento de Dispositivos**, toque no seu Apple ID e em **Confiar**.
7. Vá em **Ajustes › Privacidade e Segurança › Modo de Desenvolvedor** e ative. O iPhone reinicia; depois confirme **Ativar**.
8. Abra o Turnê do Dia e aceite as notificações.

### Renovar a cada 7 dias
Com Apple ID gratuito, o app para de abrir 7 dias depois da instalação. Para renovar, ligue o iPhone no PC e repita os passos 4 e 5 com o **mesmo IPA e o mesmo Apple ID**. Os dados continuam no app.

Para renovar sem cabo, antes do **Start** abra **Advanced options** e marque **Auto refresh**. O Sideloadly renova sozinho sempre que o PC estiver ligado e o iPhone no mesmo Wi-Fi. Para isso, ative uma vez a sincronização por Wi-Fi do iPhone no iTunes.

### Limites do Apple ID gratuito
- O app só funciona no iPhone em que foi instalado.
- Validade de 7 dias, renovável quantas vezes quiser.
- No máximo 3 apps instalados assim ao mesmo tempo por Apple ID.
- Os alarmes são notificações locais e funcionam com o app fechado e a tela bloqueada.

---

## Arquivos

- `App.js` contém as telas, os alarmes e as notificações dos dois sistemas.
- `logic.js` contém as regras: eras, XP, folga inteligente, conquistas e virada de dia. Para testar, rode `node logic.test.js`.
- `.github/workflows/gerar-apk.yml` e `gerar-ipa.yml` são as receitas que o GitHub usa para compilar.
