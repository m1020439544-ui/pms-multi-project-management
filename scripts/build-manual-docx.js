const fs = require('node:fs');
const path = require('node:path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

const lines = [
  ['h1', '智项目 · 多项目管理系统 V1.0.1 操作指导手册'],
  ['p', '本手册适用于 V1.0.1 交付版本，涵盖系统简介、跨平台部署（Windows x64 / Windows ARM11 / Linux / HarmonyOS 7 PC）、图形化启动界面、各模块操作、数据备份与常见问题。'],
  ['h2', '1. 系统简介'],
  ['p', '系统采用 B/S 架构：服务端基于 Node.js 22.5+ 与内置 SQLite，数据与附件全部保存在本地；客户端使用现代浏览器访问。覆盖项目全生命周期、PMO 管理、合同管理、文档中心、模板管理、知识库、提醒中心与 AI 能力。'],
  ['h2', '2. 运行环境要求'],
  ['li', '服务端：Windows 10/11（x64 / ARM64）、Linux（x64 / ARM64）、macOS，需 Node.js 22.5 及以上。'],
  ['li', 'HarmonyOS 7 PC：推荐使用 ArkWeb 浏览器访问服务器地址（http://服务器IP:3000）。'],
  ['li', 'Windows ARM 11：安装 Windows ARM64 版 Node.js 后本地运行，或浏览器访问服务器。'],
  ['h2', '3. 安装与启动'],
  ['li', 'Windows（x64 / ARM11）：双击 install.bat 安装依赖，双击 start.bat 启动，浏览器访问 http://localhost:3000。'],
  ['li', 'Linux / macOS / 鸿蒙开发者环境：执行 ./install.sh 与 ./start.sh。'],
  ['li', '局域网访问：放行 3000 端口，其他设备访问 http://<服务器IP>:3000。'],
  ['li', '一键后台启动：HarmonyOS/Linux 执行 ./一键启动.sh（自动装依赖并后台运行）；Windows 双击 start-bg.bat（隐藏窗口后台运行）。'],
  ['li', '停止后台服务：Linux 执行 ./stop.sh；Windows 双击 stop.bat。日志位于 data/pms.log。'],
  ['li', '图形化启动界面：Windows 双击 启动界面.bat；HarmonyOS/Linux 执行 启动界面.sh。界面提供安装/启动/停止/打开/日志/状态按钮，无需输入命令。'],
  ['h2', '4. 登录'],
  ['li', '管理员（PMO）：pmo / pmo2026，拥有全部功能。'],
  ['li', '只读用户：viewer / pmo2026，仅可查看。'],
  ['li', '管理员可在「设置 → 用户与权限配置」新增用户并配置模块编辑权限。'],
  ['h2', '5. 模块操作说明'],
  ['h3', '5.1 总览'],
  ['p', '统计卡展示在管项目、合同总额、平均回款率、风险项目；甘特图支持阶段/风险筛选；右侧为待办面板。'],
  ['h3', '5.2 项目'],
  ['p', '支持批量导入项目（下载 Excel 模板）、新建/编辑/删除项目、卡片/表格显示切换、选择当前项目进入工作区。'],
  ['h3', '5.3 项目工作区'],
  ['p', '含项目信息、资金明细、过程文档、风险记录、变更记录五个 Tab；金额联动自动重算。'],
  ['h3', '5.4 项目三阶段流程'],
  ['p', '按售中 12 步时间戳链管控：前向发起→前向归档→后向发起→后向归档→开工→到货→完工→完工款支付→初验→初验支付→终验→终验支付；每节点有必留档案；提供 AI 交付质检（10 条规则）。'],
  ['h3', '5.5 合同管理'],
  ['p', '按项目分类进入单项目视图；支持导入合同（前向/后向模板，xlsx/pdf/docx/txt），上传后自动识别字段并生成合同、AI 分析重要条款；每份合同可上传附件，支持在线查看、下载、删除并保留操作记录。'],
  ['h3', '5.6 文档中心'],
  ['p', 'DICT 标准目录（01-前向材料 / 02-售中项目管理 / 03-收尾归档），支持目录树增删改与“重建标准目录”，提供 AI 文档模板生成 DOCX。'],
  ['h3', '5.7 模板管理'],
  ['p', '文档 / 项目 / 合同三类模板，含官方售中关键文档模板，支持上传下载与版本管理。'],
  ['h3', '5.8 PMO 管理（管理员）'],
  ['p', '组合总览、一会八表、里程碑管控、质量检查、送审进度、变更台账、成员与分工七个 Tab。'],
  ['h3', '5.9 知识库'],
  ['p', '分类树、文章检索、预置售中交接问题清单（51项）、六必有、三必做矩阵等知识，支持 AI 问答。'],
  ['h3', '5.10 提醒中心'],
  ['p', '逾期/3天/7天三级分组；保证金、开票回款、收入欠费、双周管控、超期180天等规则开关。'],
  ['h3', '5.11 AI 配置（管理员）'],
  ['p', 'DeepSeek / 通义千问 / 内部私有化模型接入，API Key 加密存储；5 大能力独立开关；未配置模型时使用本地规则引擎兜底。'],
  ['h3', '5.12 设置（管理员）'],
  ['p', '全局菜单自定义（含按角色显隐）、菜单导出/导入/模板、用户与权限配置。'],
  ['h2', '6. 数据与备份'],
  ['p', '数据库：data/pms.db；附件：data/uploads；密钥：data/secret.key。备份与恢复均为复制/替换 data 目录（需先停止服务）。'],
  ['h2', '7. 常见问题'],
  ['li', '端口被占用：Windows 使用 set PORT=3001 && npm start；Linux 使用 PORT=3001 npm start。'],
  ['li', '局域网无法访问：放行防火墙 3000 端口。'],
  ['li', 'Windows ARM11 无法启动：请确认安装 Windows ARM64 版 Node.js。'],
  ['li', 'HarmonyOS PC：推荐浏览器访问模式。'],
  ['li', '忘记管理员密码：备份后删除 data/pms.db 重启恢复演示账号。'],
  ['h2', '8. 交付清单'],
  ['p', 'server/、public/、docs/、package.json、package-lock.json、install.bat、start.bat、install.sh、start.sh、data/。']
];

const children = lines.map(([type, text]) => {
  if (type === 'h1') return new Paragraph({ text, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER });
  if (type === 'h2') return new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
  if (type === 'h3') return new Paragraph({ text, heading: HeadingLevel.HEADING_3 });
  if (type === 'li') return new Paragraph({ children: [new TextRun({ text: '• ' + text, size: 21 })] });
  return new Paragraph({ children: [new TextRun({ text, size: 21 })] });
});

const doc = new Document({
  styles: { default: { document: { run: { font: 'Microsoft YaHei', size: 21 } } } },
  sections: [{ properties: {}, children }]
});

const out = path.join(__dirname, '..', 'docs', '智项目管理系统操作指导手册.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log('manual written:', out, buf.length, 'bytes');
});
