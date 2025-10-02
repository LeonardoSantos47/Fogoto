# 🚀 Crash Rocket Game

Um jogo Crash multiplayer em tempo real com HTML5 Canvas, Node.js e Socket.IO.

## 🎮 Como Jogar

1. **Faça sua aposta**: Defina o valor que deseja apostar
2. **Aguarde o foguete decolar**: O multiplicador começará em 1.00x
3. **Retire na hora certa**: Clique em "Retirar" antes do foguete explodir
4. **Ganhe**: Seu ganho = aposta × multiplicador

### ⚙️ Funcionalidades

- **Auto Retirar**: Configure um multiplicador automático
- **Modo Manual/Auto**: Diferentes modos de jogo
- **Histórico**: Veja os últimos resultados
- **Responsivo**: Funciona em desktop e mobile

## 🛠️ Tecnologias

- **Frontend**: HTML5 Canvas, CSS3, JavaScript ES6+
- **Backend**: Node.js, Express, Socket.IO
- **Deploy**: Vercel (Frontend) + Railway (Backend)
- **Real-time**: WebSockets para comunicação em tempo real

## 🚀 Como Executar Localmente

### Pré-requisitos

- Node.js 16+ instalado
- npm ou yarn

### Instalação

1. **Clone o repositório**:
```bash
git clone <url-do-repositorio>
cd crash-rocket-game
```

2. **Instale as dependências**:
```bash
# Dependências principais
npm install

# Dependências do servidor
cd server
npm install
cd ..

# Dependências do cliente (se houver)
cd client
npm install
cd ..
```

3. **Execute em desenvolvimento**:
```bash
# Executar tudo junto
npm run dev

# Ou executar separadamente:
# Terminal 1 - Servidor
npm run server

# Terminal 2 - Cliente
npm run client
```

4. **Acesse o jogo**:
- Cliente: http://localhost:8080
- Servidor: http://localhost:3001

### Scripts Disponíveis

```bash
npm run dev       # Executa cliente e servidor simultaneamente
npm run server    # Executa apenas o servidor
npm run client    # Executa apenas o cliente
npm start         # Executa o servidor em produção
```

## 📱 Compatibilidade Mobile

O jogo é otimizado para dispositivos móveis com:

- **Touch controls** otimizados
- **Layout responsivo** mobile-first
- **Performance** ajustada para dispositivos de baixo desempenho
- **Orientação** suportada (portrait/landscape)

## 🎨 Personalização

### Cores do Tema

```css
/* Principais */
--bg-primary: #1a202c     /* Fundo principal */
--bg-secondary: #2d3748   /* Painel lateral */
--accent-red: #e53e3e     /* Botão principal */
--accent-green: #38a169   /* Histórico positivo */
--text-primary: #ffffff   /* Texto principal */
```

### Configurações do Jogo

Edite `server/game-logic.js`:

```javascript
this.config = {
    waitTime: { min: 3000, max: 7000 },    // Tempo entre jogos
    countdownTime: 3000,                    // Countdown
    updateInterval: 100,                    // Frequência de atualização
    maxGameTime: 30000,                     // Tempo máximo do jogo
}
```

## 🌐 Deploy

### Frontend (Vercel)

1. **Conecte seu repositório** no dashboard da Vercel
2. **Configure as variáveis de ambiente**:
   - `SOCKET_URL`: URL do seu servidor backend

3. **Deploy automático** a cada push na branch main

### Backend (Railway)

1. **Conecte seu repositório** no Railway
2. **Configure as variáveis de ambiente**:
   - `NODE_ENV`: production
   - `CLIENT_URL`: URL do seu frontend na Vercel
   - `PORT`: 3001 (ou automático)

3. **Deploy automático** a cada push na branch main

### Variáveis de Ambiente

Crie um arquivo `.env` no diretório `server/`:

```env
NODE_ENV=production
PORT=3001
CLIENT_URL=https://seu-frontend.vercel.app
```

## 📊 Métricas e Monitoramento

### Endpoints de Status

- `GET /health` - Status do servidor
- `GET /stats` - Estatísticas do jogo

### Logs

O servidor registra automaticamente:
- Conexões/desconexões de jogadores
- Apostas e retiradas
- Crashes e resultados
- Erros e debugging

## 🔧 Solução de Problemas

### Problemas Comuns

1. **Erro de conexão WebSocket**:
   - Verifique se o servidor está rodando
   - Confirme as URLs de conexão
   - Verifique configurações de CORS

2. **Performance lenta**:
   - Reduzir qualidade gráfica em dispositivos fracos
   - Ajustar taxa de atualização (updateInterval)
   - Verificar console para erros

3. **Layout quebrado no mobile**:
   - Verificar CSS media queries
   - Testar orientação do dispositivo
   - Validar touch events

### Debug Mode

Para ativar logs de debug, adicione no console:

```javascript
// Frontend
window.game.enableDebugMode();

// Mostra FPS, estado do jogo, etc.
```

## 🎯 Roadmap

- [ ] Sistema de usuários e login
- [ ] Ranking e leaderboards
- [ ] Modos de jogo especiais
- [ ] Sistema de conquistas
- [ ] Chat em tempo real
- [ ] Histórico de apostas pessoal
- [ ] API para estatísticas

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

## 🤝 Contribuições

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📞 Suporte

Para dúvidas ou problemas:

- Abra uma [issue](../../issues) no GitHub
- Entre em contato via [email]

---

**Divirta-se jogando! 🚀🎮**
