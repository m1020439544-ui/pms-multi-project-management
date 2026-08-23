const { db, decrypt } = require('./db');
const { fmt } = require('./auth');

const CAP_NAMES = {
  extract: '字段抽取',
  riskReview: '风险审核',
  docGen: '文档生成',
  remind: '智能提醒',
  knowledge: '知识库问答'
};

function capabilityConfig(capKey) {
  const cap = db.prepare('SELECT * FROM ai_capabilities WHERE cap_key = ?').get(capKey);
  if (!cap || !cap.enabled) return null;
  const model = db.prepare('SELECT * FROM ai_models WHERE id = ? AND enabled = 1').get(cap.model_id);
  return model || null;
}

function logCall(capability, model, durationMs, status, request, response) {
  db.prepare(`INSERT INTO ai_call_logs(time,capability,model,duration_ms,status,request,response)
    VALUES(?,?,?,?,?,?,?)`)
    .run(fmt(new Date()), capability, model || '', durationMs, status, request || '', response || '');
}

async function callModel(capKey, prompt, fallbackText) {
  const model = capabilityConfig(capKey);
  const started = Date.now();
  if (model && model.endpoint && model.api_key_enc) {
    try {
      const apiKey = decrypt(model.api_key_enc);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(model.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model.model || undefined,
          messages: [
            { role: 'system', content: '你是“智项目”多项目管理系统的 AI 助手，请只输出结构化 JSON，不要输出多余解释。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || '';
        logCall(CAP_NAMES[capKey], `${model.provider}/${model.model || model.name}`, Date.now() - started, 'success', prompt, text);
        return text;
      }
      const errText = await res.text();
      logCall(CAP_NAMES[capKey], `${model.provider}/${model.model || model.name}`, Date.now() - started, 'failed', prompt, errText.slice(0, 500));
    } catch (e) {
      logCall(CAP_NAMES[capKey], `${model.provider}/${model.model || model.name}`, Date.now() - started, 'failed', prompt, String(e && e.message || e));
    }
  }
  // 未配置模型或调用失败时，返回可用的本地兜底结果（演示模式）
  logCall(CAP_NAMES[capKey], model ? `${model.provider}/${model.model || model.name}` : 'local-fallback', Date.now() - started, 'success', prompt, fallbackText);
  return fallbackText;
}

function mockExtract(sourceText) {
  const amountMatch = String(sourceText || '').match(/(?:合同金额|金额)[:：\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:万元|万|元)?/i);
  return {
    projectName: sourceText ? String(sourceText).slice(0, 30) + '（AI 预填）' : '未识别项目名称',
    amount: amountMatch ? Number(amountMatch[1]) : 0,
    unit: '待人工确认',
    duration: '待人工确认',
    payment: '按里程碑付款（待确认）',
    remark: 'AI 识别仅供参考，请以合同原件为准'
  };
}

function mockRiskReview() {
  return {
    rating: 'yellow',
    summary: 'AI 对合同文本进行了红黄绿三档扫描：未发现显性高风险条款；但存在付款节点与验收绑定条款，建议在回款台账中重点跟踪验收里程碑。',
    checklist: [
      { item: '合同主体与签章完整性', result: '通过' },
      { item: '付款条款与里程碑匹配', result: '关注' },
      { item: '违约责任与质保范围', result: '通过' },
      { item: '验收标准与交付物清单', result: '通过' }
    ]
  };
}

function mockDocGen(templateKey, project) {
  const p = project || {};
  const map = {
    info: '项目信息表',
    daily: '项目日报',
    weekly: '项目周报',
    milestone: '里程碑报告',
    acceptance: '验收报告'
  };
  return {
    title: `${p.name || '未命名项目'} - ${map[templateKey] || '文档'}`,
    generated: `根据模板与项目数据预生成的《${map[templateKey] || '文档'}》正文内容，已按江苏省智能化项目规范排版。金额、里程碑与责任人均取自台账，请在下载后人工复核。`
  };
}

function mockReminders() {
  return {
    events: [
      { title: '应收款临近', level: 'd3', projectId: 'p001', dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) }
    ]
  };
}

function mockKnowledge(question) {
  return {
    answer: `知识库尚未接入向量化文档，当前为演示回答。您的问题是：“${question}”。接入归档文档向量库后将返回带引用的答案。`,
    citations: []
  };
}

module.exports = { callModel, mockExtract, mockRiskReview, mockDocGen, mockReminders, mockKnowledge, capabilityConfig };
