const App = {
  state: {
    vendas: [],
    metaAds: { campanhas: [], isDemo: true },
    metaDaily: [],
    resumo: {},
    config: { metaConfigurado: false },
    filtros: { busca: '', status: '', pagamento: '' }
  },

  charts: { receitaGasto: null, status: null, campanhas: null },

  // ========== INIT ==========
  async init() {
    this.setupNavigation();
    this.setupForms();
    this.setupFilters();
    this.setupMobileMenu();
    this.setDataHoje();
    await this.carregarTudo();
    this.renderDashboard();
  },

  setDataHoje() {
    const el = document.getElementById('data-hoje');
    if (el) {
      el.textContent = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
      });
    }
  },

  async carregarTudo() {
    await Promise.all([
      this.fetchVendas(),
      this.fetchResumo(),
      this.fetchMetaAds(),
      this.fetchMetaAdsDaily(),
      this.fetchConfig()
    ]);
  },

  // ========== NAVIGATION ==========
  setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const page = link.getAttribute('data-page');
        this.navigateTo(page);
        // fechar sidebar no mobile
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('active');
      });
    });

    // "ver todas" link no dashboard
    document.querySelectorAll('[data-page]').forEach(el => {
      if (el.classList.contains('link-ver-todas')) {
        el.addEventListener('click', e => {
          e.preventDefault();
          this.navigateTo(el.getAttribute('data-page'));
        });
      }
    });

    // refresh button
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
        btnRefresh.classList.add('loading');
        await this.carregarTudo();
        this.renderDashboard();
        btnRefresh.classList.remove('loading');
        this.showToast('Dados atualizados!', 'success');
      });
    }
  },

  navigateTo(page) {
    // esconde todas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    // mostra a selecionada
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');

    // atualiza nav links
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.getAttribute('data-page') === page);
    });

    // carrega dados da página
    if (page === 'dashboard') this.renderDashboard();
    if (page === 'vendas') this.renderVendas();
    if (page === 'metaads') this.renderMetaAds();
    if (page === 'config') this.renderConfig();
    if (page === 'nova-venda') {
      const campoData = document.getElementById('venda-data');
      if (campoData) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        campoData.value = now.toISOString().slice(0, 16);
      }
    }

    // reinicializa ícones lucide após troca de página
    if (window.lucide) lucide.createIcons();
  },

  setupMobileMenu() {
    const toggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (toggle) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
      });
    }
    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  },

  // ========== DATA FETCHING ==========
  async fetchVendas() {
    try {
      const res = await fetch('/api/vendas');
      this.state.vendas = await res.json();
    } catch (e) { console.error('Erro ao buscar vendas:', e); }
  },

  async fetchResumo() {
    try {
      const res = await fetch('/api/resumo');
      this.state.resumo = await res.json();
    } catch (e) { console.error('Erro ao buscar resumo:', e); }
  },

  async fetchMetaAds() {
    try {
      const res = await fetch('/api/meta-ads');
      this.state.metaAds = await res.json();
    } catch (e) { console.error('Erro ao buscar Meta Ads:', e); }
  },

  async fetchMetaAdsDaily() {
    try {
      const res = await fetch('/api/meta-ads/daily');
      this.state.metaDaily = await res.json();
    } catch (e) { console.error('Erro ao buscar Meta Ads diário:', e); }
  },

  async fetchConfig() {
    try {
      const res = await fetch('/api/config');
      this.state.config = await res.json();
    } catch (e) { console.error('Erro ao buscar config:', e); }
  },

  // ========== DASHBOARD ==========
  renderDashboard() {
    const r = this.state.resumo;
    if (!r || Object.keys(r).length === 0) return;

    // KPIs
    this.animateValue('kpi-receita-valor', 0, r.receitaTotal || 0, 900, v => this.formatCurrency(v));
    this.animateValue('kpi-gastos-valor', 0, r.gastoAds || 0, 900, v => this.formatCurrency(v));
    this.animateValue('kpi-lucro-valor', 0, r.lucroLiquido || 0, 900, v => this.formatCurrency(v));

    const roasEl = document.getElementById('kpi-roas-valor');
    if (roasEl) {
      this.animateNumericValue(roasEl, 0, r.roas || 0, 900, v => v.toFixed(2) + 'x');
    }

    // subs
    this.setText('kpi-receita-sub', `${r.totalVendas || 0} vendas aprovadas`);
    this.setText('kpi-gastos-sub', this.state.metaAds.isDemo ? 'Demo - conecte o Meta Ads' : 'Meta Ads (últimos 30 dias)');

    const lucro = r.lucroLiquido || 0;
    const lucrEl = document.getElementById('kpi-lucro-valor');
    if (lucrEl) lucrEl.style.color = lucro >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

    this.setText('kpi-lucro-sub', lucro >= 0 ? '✅ Lucrativo' : '⚠️ Prejuízo');
    this.setText('kpi-roas-sub', `Ticket médio: ${this.formatCurrency(r.ticketMedio || 0)}`);

    // Charts
    this.renderChartReceitaGasto();
    this.renderChartStatus();

    // tabela recentes
    this.renderTabelaRecentes();
  },

  renderChartReceitaGasto() {
    const ctx = document.getElementById('chart-receita-gasto');
    if (!ctx) return;

    const daily = this.state.metaDaily;
    const labels = daily.map(d => d.data);

    // Agrupar receita por dia
    const vendasPorDia = {};
    this.state.vendas.filter(v => v.status === 'APROVADO').forEach(v => {
      const d = new Date(v.data);
      const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      vendasPorDia[label] = (vendasPorDia[label] || 0) + parseFloat(v.valor || 0);
    });

    const receitaData = labels.map(l => parseFloat((vendasPorDia[l] || 0).toFixed(2)));
    const gastoData = daily.map(d => d.gasto);

    if (this.charts.receitaGasto) this.charts.receitaGasto.destroy();

    this.charts.receitaGasto = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Receita (R$)',
            data: receitaData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointBackgroundColor: '#10b981',
            pointRadius: 4,
            pointHoverRadius: 6
          },
          {
            label: 'Gasto Ads (R$)',
            data: gastoData,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointBackgroundColor: '#ef4444',
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { family: 'Inter', size: 12 } } },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#f9fafb',
            bodyColor: '#9ca3af',
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: R$ ${ctx.parsed.y.toFixed(2).replace('.', ',')}`
            }
          }
        },
        scales: {
          x: { ticks: { color: '#6b7280', font: { family: 'Inter' } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#6b7280', font: { family: 'Inter' }, callback: v => 'R$ ' + v }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  },

  renderChartStatus() {
    const ctx = document.getElementById('chart-status');
    if (!ctx) return;

    const vendas = this.state.vendas;
    const aprovadas = vendas.filter(v => v.status === 'APROVADO').length;
    const pendentes = vendas.filter(v => v.status === 'PENDENTE').length;
    const reembolsadas = vendas.filter(v => v.status === 'REEMBOLSADO').length;

    if (this.charts.status) this.charts.status.destroy();

    this.charts.status = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Aprovado', 'Pendente', 'Reembolsado'],
        datasets: [{
          data: [aprovadas, pendentes, reembolsadas],
          backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(245, 158, 11, 0.8)', 'rgba(239, 68, 68, 0.8)'],
          borderColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#9ca3af', font: { family: 'Inter', size: 12 }, padding: 16 } },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#f9fafb',
            bodyColor: '#9ca3af'
          }
        }
      }
    });
  },

  renderTabelaRecentes() {
    const tbody = document.getElementById('tbody-recentes');
    if (!tbody) return;

    const recentes = [...this.state.vendas].slice(0, 5);
    if (recentes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>Nenhuma venda encontrada</p></td></tr>';
      return;
    }

    tbody.innerHTML = recentes.map(v => `
      <tr>
        <td>${this.formatDate(v.data)}</td>
        <td><strong>${this.escHtml(v.cliente)}</strong></td>
        <td>${this.escHtml(v.produto)}</td>
        <td><strong>${this.formatCurrency(v.valor)}</strong></td>
        <td>${this.badgeStatus(v.status)}</td>
        <td>${v.campanha ? `<span class="campaign-tag">${this.escHtml(v.campanha)}</span>` : '<span class="organic-tag">Orgânico</span>'}</td>
      </tr>
    `).join('');
  },

  // ========== VENDAS PAGE ==========
  renderVendas() {
    const { busca, status, pagamento } = this.state.filtros;
    let vendas = [...this.state.vendas];

    if (busca) {
      const q = busca.toLowerCase();
      vendas = vendas.filter(v =>
        (v.cliente || '').toLowerCase().includes(q) ||
        (v.email || '').toLowerCase().includes(q) ||
        (v.produto || '').toLowerCase().includes(q)
      );
    }
    if (status) vendas = vendas.filter(v => v.status === status);
    if (pagamento) vendas = vendas.filter(v => v.pagamento === pagamento);

    this.setText('vendas-total-count', `${vendas.length} venda${vendas.length !== 1 ? 's' : ''} encontrada${vendas.length !== 1 ? 's' : ''}`);
    this.setText('vendas-showing', `Mostrando ${vendas.length} de ${this.state.vendas.length} vendas`);

    const tbody = document.getElementById('tbody-vendas');
    if (!tbody) return;

    if (vendas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><p>Nenhuma venda encontrada com esses filtros</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = vendas.map(v => `
      <tr>
        <td>${this.formatDate(v.data)}</td>
        <td><strong>${this.escHtml(v.cliente)}</strong></td>
        <td class="text-muted">${this.escHtml(v.email)}</td>
        <td>${this.escHtml(v.produto)}</td>
        <td><strong>${this.formatCurrency(v.valor)}</strong></td>
        <td>${this.badgeStatus(v.status)}</td>
        <td>${this.escHtml(v.pagamento)}</td>
        <td>${v.campanha ? `<span class="campaign-tag" title="${this.escHtml(v.campanha)}">${this.escHtml(v.campanha)}</span>` : '<span class="organic-tag">—</span>'}</td>
        <td>${v.anuncio ? `<span class="campaign-tag" title="${this.escHtml(v.anuncio)}">${this.escHtml(v.anuncio)}</span>` : '<span class="organic-tag">—</span>'}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="App.deletarVenda('${v.id}')" title="Excluir venda">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      </tr>
    `).join('');

    if (window.lucide) lucide.createIcons();
  },

  async deletarVenda(id) {
    if (!confirm('Tem certeza que deseja excluir esta venda?')) return;
    try {
      const res = await fetch('/api/vendas/' + id, { method: 'DELETE' });
      if (res.ok) {
        await this.fetchVendas();
        await this.fetchResumo();
        this.renderVendas();
        this.showToast('Venda excluída com sucesso!', 'success');
      } else {
        this.showToast('Erro ao excluir venda', 'error');
      }
    } catch (e) {
      this.showToast('Erro de conexão', 'error');
    }
  },

  setupFilters() {
    const busca = document.getElementById('filtro-busca');
    const status = document.getElementById('filtro-status');
    const pagamento = document.getElementById('filtro-pagamento');

    if (busca) busca.addEventListener('input', e => { this.state.filtros.busca = e.target.value; this.renderVendas(); });
    if (status) status.addEventListener('change', e => { this.state.filtros.status = e.target.value; this.renderVendas(); });
    if (pagamento) pagamento.addEventListener('change', e => { this.state.filtros.pagamento = e.target.value; this.renderVendas(); });
  },

  // ========== META ADS PAGE ==========
  renderMetaAds() {
    const meta = this.state.metaAds;
    const campanhas = meta.campanhas || [];

    // Badge demo/real
    const badge = document.getElementById('meta-connection-badge');
    if (badge) {
      badge.innerHTML = meta.isDemo
        ? '<span class="dot dot-red"></span><span>Modo Demo</span>'
        : '<span class="dot dot-green"></span><span>Conectado</span>';
    }

    // KPIs
    const totalGasto = campanhas.reduce((s, c) => s + (c.gasto || 0), 0);
    const totalImpressoes = campanhas.reduce((s, c) => s + (c.impressoes || 0), 0);
    const totalCliques = campanhas.reduce((s, c) => s + (c.cliques || 0), 0);

    this.animateValue('meta-gasto-total', 0, totalGasto, 800, v => this.formatCurrency(v));
    this.setText('meta-impressoes', this.formatNumber(totalImpressoes));
    this.setText('meta-cliques', this.formatNumber(totalCliques));

    // Gráfico de campanhas
    this.renderChartCampanhas(campanhas);

    // Tabela
    const tbody = document.getElementById('tbody-campanhas');
    if (!tbody) return;

    if (campanhas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>Nenhuma campanha encontrada</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = campanhas.map(c => {
      const ctr = c.impressoes > 0 ? ((c.cliques / c.impressoes) * 100).toFixed(2) : '0.00';
      const cpa = c.conversoes > 0 ? (c.gasto / c.conversoes).toFixed(2) : '—';
      return `
        <tr>
          <td><strong>${this.escHtml(c.nome)}</strong></td>
          <td>${c.status === 'ATIVO' ? '<span class="badge badge-ativo">ATIVO</span>' : '<span class="badge badge-pausado">PAUSADO</span>'}</td>
          <td><strong class="text-red">${this.formatCurrency(c.gasto)}</strong></td>
          <td>${this.formatNumber(c.impressoes)}</td>
          <td>${this.formatNumber(c.cliques)}</td>
          <td>${ctr}%</td>
          <td>${c.conversoes || 0}</td>
          <td>${cpa !== '—' ? 'R$ ' + parseFloat(cpa).toFixed(2).replace('.', ',') : '—'}</td>
        </tr>
      `;
    }).join('');
  },

  renderChartCampanhas(campanhas) {
    const ctx = document.getElementById('chart-campanhas');
    if (!ctx) return;

    if (this.charts.campanhas) this.charts.campanhas.destroy();

    const nomes = campanhas.map(c => c.nome.length > 30 ? c.nome.slice(0, 30) + '...' : c.nome);
    const gastos = campanhas.map(c => c.gasto);

    this.charts.campanhas = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: nomes,
        datasets: [{
          label: 'Gasto (R$)',
          data: gastos,
          backgroundColor: ['rgba(139, 92, 246, 0.7)', 'rgba(59, 130, 246, 0.7)', 'rgba(16, 185, 129, 0.7)', 'rgba(245, 158, 11, 0.7)'],
          borderColor: ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b'],
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#f9fafb',
            bodyColor: '#9ca3af',
            callbacks: { label: ctx => ` R$ ${ctx.parsed.x.toFixed(2).replace('.', ',')}` }
          }
        },
        scales: {
          x: { ticks: { color: '#6b7280', font: { family: 'Inter' }, callback: v => 'R$ ' + v }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#9ca3af', font: { family: 'Inter' } }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  },

  // ========== NOVA VENDA FORM ==========
  setupForms() {
    const formVenda = document.getElementById('form-nova-venda');
    if (formVenda) {
      formVenda.addEventListener('submit', async e => {
        e.preventDefault();
        const novaVenda = {
          data: document.getElementById('venda-data').value,
          cliente: document.getElementById('venda-cliente').value,
          email: document.getElementById('venda-email').value,
          produto: document.getElementById('venda-produto').value,
          valor: parseFloat(document.getElementById('venda-valor').value),
          status: document.getElementById('venda-status').value,
          pagamento: document.getElementById('venda-pagamento').value,
          campanha: document.getElementById('venda-campanha').value,
          anuncio: document.getElementById('venda-anuncio').value
        };

        try {
          const res = await fetch('/api/vendas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novaVenda)
          });
          if (res.ok) {
            await this.fetchVendas();
            await this.fetchResumo();
            formVenda.reset();
            const campoData = document.getElementById('venda-data');
            if (campoData) {
              const now = new Date();
              now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
              campoData.value = now.toISOString().slice(0, 16);
            }
            this.showToast('Venda salva com sucesso! ✅', 'success');
          } else {
            this.showToast('Erro ao salvar venda', 'error');
          }
        } catch (e) {
          this.showToast('Erro de conexão com o servidor', 'error');
        }
      });
    }

    const formConfig = document.getElementById('form-config-meta');
    if (formConfig) {
      formConfig.addEventListener('submit', async e => {
        e.preventDefault();
        const metaToken = document.getElementById('config-meta-token').value;
        const metaAccountId = document.getElementById('config-meta-account').value;

        try {
          const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metaToken, metaAccountId })
          });
          if (res.ok) {
            await this.fetchConfig();
            await this.fetchMetaAds();
            await this.fetchResumo();
            this.renderConfig();
            this.showToast('Configuração salva! Conectando ao Meta Ads...', 'success');
          } else {
            this.showToast('Erro ao salvar configuração', 'error');
          }
        } catch (e) {
          this.showToast('Erro de conexão', 'error');
        }
      });
    }
  },

  async fetchWebhookUrl() {
    try {
      const res = await fetch('/api/webhook-url');
      const data = await res.json();
      const input = document.getElementById('active-webhook-url');
      if (input && data.webhookUrl) input.value = data.webhookUrl;
    } catch (_) {}
  },

  copiarWebhookUrl() {
    const input = document.getElementById('active-webhook-url');
    if (input && input.value) {
      navigator.clipboard.writeText(input.value);
      this.showToast('URL do Webhook copiada! 📋', 'success');
    }
  },

  // ========== CONFIG PAGE ==========
  renderConfig() {
    this.fetchWebhookUrl();
    const statusEl = document.getElementById('config-meta-status');
    const metaBadge = document.getElementById('meta-connection-badge');
    const configurado = this.state.config.metaConfigurado;

    if (statusEl) {
      statusEl.innerHTML = configurado
        ? '<span class="dot dot-green"></span><span>Conectado</span>'
        : '<span class="dot dot-red"></span><span>Desconectado</span>';
    }
    if (metaBadge) {
      metaBadge.innerHTML = configurado
        ? '<span class="dot dot-green"></span><span>Conectado</span>'
        : '<span class="dot dot-red"></span><span>Demo</span>';
    }

    if (window.lucide) lucide.createIcons();
  },

  // ========== TOAST ==========
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon">
        <i data-lucide="${type === 'success' ? 'check-circle' : 'x-circle'}"></i>
      </div>
      <span class="toast-message">${message}</span>
    `;
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
      toast.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => toast.remove(), 280);
    }, 3000);
  },

  // ========== UTILITIES ==========
  formatCurrency(value) {
    return 'R$ ' + parseFloat(value || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  },

  formatNumber(value) {
    return parseInt(value || 0).toLocaleString('pt-BR');
  },

  formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  },

  badgeStatus(status) {
    const map = {
      'APROVADO': 'badge-aprovado',
      'PENDENTE': 'badge-pendente',
      'REEMBOLSADO': 'badge-reembolsado'
    };
    const cls = map[status] || 'badge-pausado';
    const labels = { APROVADO: 'Aprovado', PENDENTE: 'Pendente', REEMBOLSADO: 'Reembolsado' };
    return `<span class="badge ${cls}">${labels[status] || status}</span>`;
  },

  animateValue(id, start, end, duration, formatter) {
    const el = document.getElementById(id);
    if (!el) return;
    const startTime = performance.now();
    const update = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      el.textContent = formatter ? formatter(current) : current.toFixed(2);
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  },

  animateNumericValue(el, start, end, duration, formatter) {
    if (!el) return;
    const startTime = performance.now();
    const update = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      el.textContent = formatter ? formatter(current) : current.toFixed(2);
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
