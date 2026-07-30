require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Garante que o diretório data/ existe
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const vendasPath = path.join(dataDir, 'vendas.json');

const vendasExemplo = [];

function lerVendas() {
  if (!fs.existsSync(vendasPath)) {
    fs.writeFileSync(vendasPath, JSON.stringify(vendasExemplo, null, 2));
    console.log('✅ Arquivo de vendas criado com dados de exemplo');
  }
  return JSON.parse(fs.readFileSync(vendasPath, 'utf8'));
}

function salvarVendas(vendas) {
  fs.writeFileSync(vendasPath, JSON.stringify(vendas, null, 2));
}

// Dados demo do Meta Ads
function getMetaAdsDemo() {
  return {
    isDemo: true,
    campanhas: []
  };
}

function getMetaAdsDailyDemo() {
  return [];
}

// ==================== ROTAS ====================

// GET /api/vendas
app.get('/api/vendas', (req, res) => {
  try {
    const vendas = lerVendas();
    res.json(vendas);
  } catch (err) {
    console.error('Erro ao ler vendas:', err);
    res.status(500).json({ erro: 'Erro ao carregar vendas' });
  }
});

// POST /api/vendas
app.post('/api/vendas', (req, res) => {
  try {
    const vendas = lerVendas();
    const novaVenda = {
      id: Date.now().toString(),
      ...req.body
    };
    vendas.unshift(novaVenda);
    salvarVendas(vendas);
    console.log('✅ Nova venda adicionada:', novaVenda.cliente);
    res.json(novaVenda);
  } catch (err) {
    console.error('Erro ao salvar venda:', err);
    res.status(500).json({ erro: 'Erro ao salvar venda' });
  }
});

// POST /api/webhook/centralcart - Recebe vendas automáticas da CentralCart
app.post('/api/webhook/centralcart', (req, res) => {
  try {
    const body = req.body || {};
    
    // Log de depuração
    const debugPath = path.join(dataDir, 'webhook_debug.log');
    fs.appendFileSync(debugPath, `--- WEBHOOK RECEBIDO EM ${new Date().toISOString()} ---\n` + JSON.stringify(body, null, 2) + '\n\n');

    // Estrutura real da CentralCart:
    // body.event = "ORDER_CREATED" | "ORDER_APPROVED" | "ORDER_REFUNDED" | "ORDER_CHARGEBACK"
    // body.data = { client_name, client_email, price, status, gateway_display, packages[], tracking{}, internal_id, created_at ... }
    const evento = body.event || '';
    const pedido = body.data || body;

    const cliente = pedido.client_name || 'Cliente';
    const email = pedido.client_email || '—';
    const valor = parseFloat(pedido.price || 0);

    // Mapeia status baseado no evento E no campo status
    let status = 'PENDENTE';
    const rawStatus = (pedido.status || '').toUpperCase();
    if (evento === 'ORDER_APPROVED' || rawStatus === 'APPROVED' || rawStatus === 'PAID') {
      status = 'APROVADO';
    } else if (evento === 'ORDER_REFUNDED' || rawStatus === 'REFUNDED') {
      status = 'REEMBOLSADO';
    } else if (evento === 'ORDER_CHARGEBACK' || rawStatus === 'CHARGEBACK') {
      status = 'REEMBOLSADO';
    } else if (rawStatus === 'PENDING' || evento === 'ORDER_CREATED') {
      status = 'PENDENTE';
    }

    const pagamento = pedido.gateway_display || pedido.gateway || 'Pix';

    // Produtos — CentralCart usa "packages" ao invés de "items"
    let produto = 'Produto';
    if (pedido.packages && pedido.packages.length > 0) {
      produto = pedido.packages.map(p => p.name || 'Produto').join(', ');
    }

    // Tracking / UTMs do Meta Ads
    const tracking = pedido.tracking || {};
    const campanha = tracking.utm_campaign || '';
    const anuncio = tracking.utm_content || '';

    // ID único do pedido na CentralCart
    const pedidoId = pedido.internal_id || body.id || Date.now().toString();

    const novaVenda = {
      id: pedidoId,
      data: pedido.created_at || new Date().toISOString(),
      valor,
      cliente,
      email,
      status,
      pagamento,
      campanha,
      anuncio,
      produto
    };

    const vendas = lerVendas();
    // Atualiza se já existe (ex: pedido criado -> aprovado)
    const idx = vendas.findIndex(v => v.id === novaVenda.id);
    if (idx >= 0) {
      vendas[idx] = novaVenda;
    } else {
      vendas.unshift(novaVenda);
    }

    salvarVendas(vendas);
    console.log(`⚡ [${evento}] R$ ${valor} - ${cliente} (${status}) - ${produto}`);
    
    res.status(200).json({ success: true, message: 'Webhook recebido com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao processar webhook:', err);
    res.status(500).json({ error: 'Erro interno ao processar webhook' });
  }
});

// DELETE /api/vendas/:id
app.delete('/api/vendas/:id', (req, res) => {
  try {
    let vendas = lerVendas();
    const antes = vendas.length;
    vendas = vendas.filter(v => v.id !== req.params.id);
    if (vendas.length === antes) {
      return res.status(404).json({ erro: 'Venda não encontrada' });
    }
    salvarVendas(vendas);
    console.log('🗑️ Venda removida:', req.params.id);
    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao deletar venda:', err);
    res.status(500).json({ erro: 'Erro ao deletar venda' });
  }
});

// GET /api/meta-ads
app.get('/api/meta-ads', async (req, res) => {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !accountId) {
    return res.json(getMetaAdsDemo());
  }

  try {
    const fetch = require('node-fetch');
    const hoje = new Date().toISOString().split('T')[0];
    const trintaDiasAtras = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const url = `https://graph.facebook.com/v19.0/${accountId}/campaigns?fields=name,status,insights.time_range({"since":"${trintaDiasAtras}","until":"${hoje}"}){spend,impressions,clicks,actions}&access_token=${token}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('Erro Meta API:', data.error.message);
      return res.json({ ...getMetaAdsDemo(), erro: data.error.message });
    }

    const campanhas = (data.data || []).map(c => {
      const ins = c.insights && c.insights.data && c.insights.data[0];
      const conversoes = ins && ins.actions ? ins.actions.filter(a => a.action_type === 'purchase').reduce((s, a) => s + parseInt(a.value || 0), 0) : 0;
      return {
        id: c.id,
        nome: c.name,
        status: c.status === 'ACTIVE' ? 'ATIVO' : 'PAUSADO',
        gasto: parseFloat(ins ? ins.spend || 0 : 0),
        impressoes: parseInt(ins ? ins.impressions || 0 : 0),
        cliques: parseInt(ins ? ins.clicks || 0 : 0),
        conversoes
      };
    });

    res.json({ isDemo: false, campanhas });
  } catch (err) {
    console.error('Erro ao buscar Meta Ads:', err);
    res.json(getMetaAdsDemo());
  }
});

// GET /api/meta-ads/daily
app.get('/api/meta-ads/daily', async (req, res) => {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !accountId) {
    return res.json(getMetaAdsDailyDemo());
  }

  try {
    const fetch = require('node-fetch');
    const hoje = new Date().toISOString().split('T')[0];
    const seteDiasAtras = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
    const url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=spend,date_start&time_range={"since":"${seteDiasAtras}","until":"${hoje}"}&time_increment=1&access_token=${token}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return res.json(getMetaAdsDailyDemo());
    }

    const daily = (data.data || []).map(d => ({
      data: new Date(d.date_start).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      gasto: parseFloat(d.spend || 0)
    }));

    res.json(daily);
  } catch (err) {
    res.json(getMetaAdsDailyDemo());
  }
});

// GET /api/config
app.get('/api/config', (req, res) => {
  res.json({
    metaConfigurado: !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID)
  });
});

// POST /api/config
app.post('/api/config', (req, res) => {
  try {
    const { metaToken, metaAccountId } = req.body;
    const envPath = path.join(__dirname, '.env');
    const conteudo = `META_ACCESS_TOKEN=${metaToken || ''}\nMETA_AD_ACCOUNT_ID=${metaAccountId || ''}\nPORT=${process.env.PORT || 3000}\n`;
    fs.writeFileSync(envPath, conteudo);
    process.env.META_ACCESS_TOKEN = metaToken || '';
    process.env.META_AD_ACCOUNT_ID = metaAccountId || '';
    console.log('✅ Configuração do Meta Ads salva');
    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao salvar config:', err);
    res.status(500).json({ erro: 'Erro ao salvar configuração' });
  }
});

// GET /api/resumo
app.get('/api/resumo', async (req, res) => {
  try {
    const vendas = lerVendas();
    const aprovadas = vendas.filter(v => v.status === 'APROVADO');
    const receitaTotal = aprovadas.reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);

    let gastoAds = 0;
    const token = process.env.META_ACCESS_TOKEN;
    const accountId = process.env.META_AD_ACCOUNT_ID;

    if (token && accountId) {
      try {
        const fetch = require('node-fetch');
        const hoje = new Date().toISOString().split('T')[0];
        const trintaDiasAtras = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=spend&time_range={"since":"${trintaDiasAtras}","until":"${hoje}"}&access_token=${token}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.data && data.data[0]) {
          gastoAds = parseFloat(data.data[0].spend || 0);
        }
      } catch (_) {}
    } else {
      gastoAds = 0.00; // zerado para testes
    }

    const lucroLiquido = receitaTotal - gastoAds;
    const roas = gastoAds > 0 ? receitaTotal / gastoAds : 0;
    const ticketMedio = aprovadas.length > 0 ? receitaTotal / aprovadas.length : 0;

    res.json({
      receitaTotal: parseFloat(receitaTotal.toFixed(2)),
      gastoAds: parseFloat(gastoAds.toFixed(2)),
      lucroLiquido: parseFloat(lucroLiquido.toFixed(2)),
      roas: parseFloat(roas.toFixed(2)),
      totalVendas: aprovadas.length,
      totalPedidos: vendas.length,
      ticketMedio: parseFloat(ticketMedio.toFixed(2))
    });
  } catch (err) {
    console.error('Erro ao gerar resumo:', err);
    res.status(500).json({ erro: 'Erro ao gerar resumo' });
  }
});

let publicWebhookUrl = '';

function iniciarTunnel() {
  const { spawn } = require('child_process');
  const ssh = spawn('ssh', ['-o', 'StrictHostKeyChecking=no', '-R', '80:localhost:3000', 'nokey@localhost.run']);
  
  ssh.stdout.on('data', (data) => {
    const output = data.toString();
    const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/);
    if (match) {
      publicWebhookUrl = `${match[0]}/api/webhook/centralcart`;
      console.log(`\n======================================================`);
      console.log(`⚡ WEBHOOK URL PARA CENTRALCART (SEM TELA DE AVISO):`);
      console.log(`👉 ${publicWebhookUrl}`);
      console.log(`======================================================\n`);
    }
  });

  ssh.on('close', () => {
    console.log('Tunnel SSH desconectado. Reconectando em 3s...');
    setTimeout(iniciarTunnel, 3000);
  });
}

// GET /api/webhook-url
app.get('/api/webhook-url', (req, res) => {
  res.json({ webhookUrl: publicWebhookUrl || `http://localhost:${PORT}/api/webhook/centralcart` });
});

// Rota raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Dashboard de Vendas rodando em: http://localhost:${PORT}`);
  console.log(`📊 Abra o link acima no navegador para ver o dashboard!\n`);
  iniciarTunnel();
});
