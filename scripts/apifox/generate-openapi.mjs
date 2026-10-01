// 从中育工具箱前端源码汇总的 REST 接口，生成 Apifox 可导入的 OpenAPI 3.0 规范。
// 运行：node scripts/apifox/generate-openapi.mjs
// 输出：scripts/apifox/zhongyu-api.openapi.json
//
// 返回包装约定（从不同前端模块反推的真实契约）：
//   - 中育 ABP 接口（/api/services/app/*、/api/TokenAuth/*）：
//       { success, result, error, unAuthorizedRequest, __abp }
//   - 优客畅学（/SelfStudy/*）：{ data }
//   - 云笔记（/CloudNotes/*）：{ code, data, msg }，data 为 AES-ECB(Base64) 密文，需当日密钥解密
//   - 领创 Linspirer：JSON-RPC 风格 { code, data, msg }，请求 params 为 AES-CBC 密文
//   - 学校发现（hagateway）：直接 { name, server, webServer, lcid }
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const API_BASE = 'http://sxz.spi.zykj.org'
const LINSPIRER_BASE = 'https://cloud.linspirer.com:883'
const HAGW_BASE = 'https://hagateway.zykj.org'

const bearer = [{ bearerAuth: [] }]

/* ----------------------------- 加密调试脚本（写入分组说明，供在 Apifox 配置前置/后置脚本） ----------------------------- */
const CLOUDNOTE_TAG_DESC = `**云笔记（CloudNotes）**：所有请求 query/body 与响应 data 均为 AES-ECB 密文，密钥每日动态生成（见 genAesKey）。\n\n` +
  `在 Apifox 对本分组配置「前置脚本」自动加密、「后置脚本」自动解密（CryptoJS 为 Apifox 内置全局变量）：\n\n` +
  `\`\`\`js\n` +
  `// 前置脚本：加密请求（GET 加密整个 query 串；POST 加密 body 明文字符串）\n` +
  `function genAesKey(){\n` +
  `  const e = ":F0wKU!Qg3}UkbW+w[:9|D3-5h=:T;7t#_GZ4#G;~ZNSq{8;}QIP>'{q.lje";\n` +
  `  const t = new Date(), n = t.getFullYear(), r = t.getMonth()+1, o = t.getDate();\n` +
  `  const i = 33 + o*r*33, a = String.fromCharCode((i%94)+33), s = e[o+r];\n` +
  `  const c = (n*r*o) % e.length, u = e.substring(c), l = e.substring(0,c);\n` +
  `  return a + (u+l).substring(0,14) + s;\n` +
  `}\n` +
  `function enc(plain){\n` +
  `  return CryptoJS.AES.encrypt(plain, CryptoJS.enc.Utf8.parse(genAesKey()),\n` +
  `    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString();\n` +
  `}\n` +
  `if (pm.request.method === 'GET') {\n` +
  `  const raw = pm.request.url.query.map(q => q.key + '=' + q.value).join('&');\n` +
  `  pm.request.url = pm.request.url.toString().split('?')[0] + '?' + encodeURIComponent(enc(raw));\n` +
  `} else if (typeof (pm.request.body && pm.request.body.raw) === 'string') {\n` +
  `  pm.request.body.raw = enc(pm.request.body.raw);\n` +
  `}\n` +
  `\`\`\`\n\n` +
  `\`\`\`js\n` +
  `// 后置脚本：解密响应 data（data 为密文，解密后替换回响应体）\n` +
  `function genAesKey(){ /* 同前置脚本 */ }\n` +
  `function dec(b64){\n` +
  `  return CryptoJS.AES.decrypt(b64, CryptoJS.enc.Utf8.parse(genAesKey()),\n` +
  `    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8);\n` +
  `}\n` +
  `try {\n` +
  `  const j = JSON.parse(pm.response.text());\n` +
  `  if (j && j.data) { j.data = JSON.parse(dec(j.data)); pm.response.setBodyText(JSON.stringify(j)); }\n` +
  `} catch (e) {}\n` +
  `\`\`\``

const LIN_TAG_DESC = `**领创 Linspirer（第三方）**：请求 params 为 AES-CBC 密文（固定 KEY/IV），响应 data 可能加密或明文。\n\n` +
  `KEY = 1191ADF18489D8DA，IV = 5E9B755A8B674394。\n\n` +
  `\`\`\`js\n` +
  `// 前置脚本：加密 body.params（约定调试时明文以 PLAIN: 开头，脚本自动加密）\n` +
  `function enc(plain){\n` +
  `  return CryptoJS.AES.encrypt(plain, CryptoJS.enc.Utf8.parse("1191ADF18489D8DA"),\n` +
  `    { iv: CryptoJS.enc.Utf8.parse("5E9B755A8B674394"), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString();\n` +
  `}\n` +
  `const body = JSON.parse(pm.request.body.raw);\n` +
  `if (typeof body.params === 'string' && body.params.startsWith('PLAIN:')) {\n` +
  `  body.params = enc(body.params.slice(6));\n` +
  `  pm.request.body.raw = JSON.stringify(body);\n` +
  `}\n` +
  `\`\`\`\n\n` +
  `\`\`\`js\n` +
  `// 后置脚本：解密响应 data\n` +
  `function dec(b64){\n` +
  `  return CryptoJS.AES.decrypt(b64, CryptoJS.enc.Utf8.parse("1191ADF18489D8DA"),\n` +
  `    { iv: CryptoJS.enc.Utf8.parse("5E9B755A8B674394"), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8);\n` +
  `}\n` +
  `try {\n` +
  `  const j = JSON.parse(pm.response.text());\n` +
  `  if (j && j.data) { j.data = dec(j.data); pm.response.setBodyText(JSON.stringify(j)); }\n` +
  `} catch (e) {}\n` +
  `\`\`\``

/* ----------------------------- 返回包装 helper ----------------------------- */
const abp = (result) => ({ success: true, result, error: null, unAuthorizedRequest: false, __abp: true })
const selfstudy = (data) => ({ data })
const cloudnotes = () => ({ code: 0, data: '<AES-ECB(Base64) 密文，需用当日密钥解密后才是 JSON>', msg: 'ok' })
const linspirer = (data) => ({ code: 0, data, msg: 'ok' })

/* ----------------------------- 接口定义 ----------------------------- */
// 字段：tag, method, path, summary, auth, headers[],
//       params[{name,in,required,schema,description,example}],
//       body(请求体 schema|null), bodyExamples[{name,summary,value}],
//       desc(详细中文说明), returns{wrap, result}
const ops = [
  /* ---------------- 认证与账户 ---------------- */
  {
    tag: '认证与账户', method: 'GET', path: `${HAGW_BASE}/api/discovery/{code}`,
    summary: '学校发现', auth: false,
    desc: `根据学校代码（如 sxz）发现该学校的服务地址。\n\n` +
      `**返回字段**：\n- name：学校名称\n- server：REST API 基地址（后续所有 /api 请求都发往此处）\n- webServer：网页/嵌入页基地址（navPage.html、index.html 等走此域，与 REST 不同域）\n- lcid：区域/语言标识（可选）\n\n` +
      `内嵌 App 登录后，server 与 webServer 会被写入 localStorage（apiBaseUrl / iframeBase）。`,
    params: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' }, description: '学校代码', example: 'sxz' }],
    returns: { wrap: 'disc', result: { name: '省锡中', server: 'http://sxz.api.zykj.org', webServer: 'http://sxz.school.zykj.org', lcid: 'zh-CN' } }
  },
  {
    tag: '认证与账户', method: 'POST', path: '/api/TokenAuth/Login',
    summary: '登录获取令牌', auth: false,
    desc: `用户名 + 密码登录，换取 accessToken / refreshToken。\n\n` +
      `**请求体**：userName、password 必填；clientType 默认 1。\n` +
      `**返回 result**：accessToken（鉴权用，后续请求 Authorization: Bearer <token>）、refreshToken（刷新用）、expireInSeconds、refreshExpireInSeconds。`,
    body: { type: 'object', required: ['userName', 'password'], properties: {
      userName: { type: 'string' }, password: { type: 'string' }, clientType: { type: 'integer', default: 1 }
    } },
    bodyExamples: [{ name: '登录', summary: '学生账号登录', value: { userName: '2024001', password: '******', clientType: 1 } }],
    returns: { wrap: 'abp', result: { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', refreshToken: '...', expireInSeconds: 86400, refreshExpireInSeconds: 604800 } }
  },
  {
    tag: '认证与账户', method: 'GET', path: '/api/services/app/User/GetInfoAsync',
    summary: '获取用户信息（含加密学生信息）', auth: true,
    desc: `获取当前登录用户的基本信息（realName、photo、schoolCode 等）。\n\n` +
      `该接口同时用于选课嵌入页预热：返回的学生信息会被注入到官方页面，用于生成 userInfo 脚本。\n` +
      `**返回 result**：realName 姓名、photo 头像、schoolCode 学校代码，其余字段因业务而异（any）。`,
    returns: { wrap: 'abp', result: { realName: '张三', photo: 'http://.../avatar.png', schoolCode: 'sxz', id: 10001, userName: '2024001' } }
  },
  {
    tag: '认证与账户', method: 'POST', path: '/api/TokenAuth/RefreshToken',
    summary: '刷新令牌', auth: true,
    headers: ['refreshtoken'],
    desc: `用 refreshToken 换取新的 accessToken。\n\n` +
      `**请求头**：refreshtoken（必填，值为旧 refreshToken）；Authorization 仍带旧 accessToken。\n` +
      `**返回 result**：同登录（新的 accessToken / refreshToken 及过期时间）。`,
    body: { type: 'object', properties: {} },
    bodyExamples: [{ name: '刷新', summary: '携 refreshtoken 头刷新', value: {} }],
    returns: { wrap: 'abp', result: { accessToken: 'eyJ...', refreshToken: '...', expireInSeconds: 86400, refreshExpireInSeconds: 604800 } }
  },

  /* ---------------- 在线专栏 ---------------- */
  {
    tag: '在线专栏', method: 'GET', path: '/api/services/app/appWebSite/GetTopicSpecialAsync', summary: '获取专栏列表与学科', auth: true,
    desc: `获取「学科 + 专栏」树：每个学科下挂若干专栏（cols）。\n\n**返回 result**：TopicSpecial[]，每项含 topicId、topicName、cols[{id,name,sort}]。`,
    returns: { wrap: 'abp', result: [{ topicId: 4, topicName: '语文', cols: [{ id: 101, name: '语文专栏', sort: 1 }] }] }
  },
  {
    tag: '在线专栏', method: 'POST', path: '/api/services/app/appWebSite/SearchMyPagesByColIdAsync', summary: '查看/搜索专栏文章',
    auth: true,
    desc: `分页拉取某个专栏下的文章；传入 pageTitle 即视为「标题模糊搜索」。\n\n` +
      `**返回 result**：分页对象 { totalCount, items: ColumnPageItem[] }。item 含 id、title、hits、comments、stars、collects、publishTime、isRead 等。`,
    body: { type: 'object', required: ['colId'], properties: {
      colId: { type: 'integer', example: 101 }, skipCount: { type: 'integer', default: 0 }, maxResultCount: { type: 'integer', default: 20 },
      orderBy: { type: 'string', default: 'PublishTime' }, pageTitle: { type: 'string', description: '传入即视为标题模糊搜索' }
    } },
    bodyExamples: [{ name: '按专栏浏览', summary: '分页拉取专栏文章', value: { colId: 101, skipCount: 0, maxResultCount: 20, orderBy: 'PublishTime' } },
                   { name: '标题搜索', summary: '按标题模糊搜', value: { colId: 101, pageTitle: '期中', maxResultCount: 20 } }],
    returns: { wrap: 'abp', result: { totalCount: 35, items: [{ id: 9001, specialColId: 101, title: '文言文阅读技巧', hits: 120, comments: 3, stars: 8, collects: 2, state: 1, publishTime: '2026-09-01 10:00:00', isTop: false, isRead: false, publisher: '语文组' }] } }
  },
  {
    tag: '在线专栏', method: 'GET', path: '/api/services/app/appWebSite/GetPageAsync', summary: '获取文章详情', auth: true,
    desc: `根据文章 id 获取专栏文章详情（含正文 HTML）。\n\n**返回 result**：ColumnPageDetail，含 title、content(HTML)、hits、stars、collects、creatorUser、publishTime 等。content 中的附件/PDF 链接可用 extractFileUrl 解析后由原生层打开。`,
    params: [{ name: 'id', in: 'query', required: true, schema: { type: 'integer' }, description: '文章 id', example: 9001 }],
    returns: { wrap: 'abp', result: { id: 9001, specialColId: 101, title: '文言文阅读技巧', content: '<p>正文 HTML...</p>', hits: 120, comments: 3, stars: 8, collects: 2, state: 1, isTop: false, publishTime: '2026-09-01 10:00:00', creatorUser: { id: 1, userName: 'teacher', fullName: '语文组', gender: 1, picture: null, roleType: 2 } } }
  },
  {
    tag: '在线专栏', method: 'POST', path: '/api/services/app/AppWebSite/HitAsync', summary: '标记文章已读（命中）', auth: true,
    desc: `标记某篇文章已读（Hit 统计/已读状态）。\n\n**请求参数**：pageId（query，文章 id）。**返回 result**：通常为 null。`,
    params: [{ name: 'pageId', in: 'query', required: true, schema: { type: 'integer' }, description: '文章 id', example: 9001 }],
    returns: { wrap: 'abp', result: null }
  },
  {
    tag: '在线专栏', method: 'GET', path: '/api/services/app/AppWebSite/GetSpecialCatalogAsync', summary: '查看我的收藏夹', auth: true,
    desc: `获取当前用户的收藏夹（catalog）列表。\n\n**返回 result**：Catalog[]，每项含 id、name、collectCount。`,
    returns: { wrap: 'abp', result: [{ id: 5001, name: '我的收藏', collectCount: 12 }] }
  },
  {
    tag: '在线专栏', method: 'GET', path: '/api/services/app/AppWebSite/GetMyCatalogPagesAsync', summary: '查看收藏夹里的文章', auth: true,
    desc: `分页拉取某收藏夹内的文章。\n\n**返回 result**：分页对象 { totalCount, items: CatalogPageItem[] }。`,
    params: [
      { name: 'catalogId', in: 'query', required: true, schema: { type: 'integer' }, description: '收藏夹 id', example: 5001 },
      { name: 'maxResultCount', in: 'query', schema: { type: 'integer', default: 20 } },
      { name: 'skipCount', in: 'query', schema: { type: 'integer', default: 0 } }
    ],
    returns: { wrap: 'abp', result: { totalCount: 12, items: [{ id: 9001, specialPageId: 9001, title: '文言文阅读技巧', hits: 120, comments: 3, stars: 8, collects: 2, isActive: true, collectTime: '2026-09-02 08:00:00' }] } }
  },
  {
    tag: '在线专栏', method: 'POST', path: '/api/services/app/Message/SetMessageReadAsync', summary: '标记单条消息已读', auth: true,
    desc: `标记一条文章更新消息为已读。\n\n**请求参数**：messageId（query）。**返回 result**：null。`,
    params: [{ name: 'messageId', in: 'query', required: true, schema: { type: 'integer' }, description: '消息 id', example: 7001 }],
    returns: { wrap: 'abp', result: null }
  },
  {
    tag: '在线专栏', method: 'POST', path: '/api/services/app/Message/GetMyMessageListAsync', summary: '查看文章更新消息', auth: true,
    desc: `分页拉取「文章发布/更新」类消息。\n\n**请求体**：Type 默认 2（专栏/文章发布更新）；skipCount、MaxResultCount 分页。\n**返回 result**：分页对象 { totalCount, items: AppMessage[] }。`,
    body: { type: 'object', properties: {
      Type: { type: 'integer', default: 2, description: '消息类型（默认 2：专栏/文章发布更新）' },
      skipCount: { type: 'integer', default: 0 }, MaxResultCount: { type: 'integer', default: 20 }
    } },
    bodyExamples: [{ name: '消息列表', summary: '拉取更新消息', value: { Type: 2, skipCount: 0, MaxResultCount: 20 } }],
    returns: { wrap: 'abp', result: { totalCount: 5, items: [{ isRead: false, parameter: { id: 9001 }, senderInfo: { id: 1, userName: 'teacher', fullName: '语文组', gender: 1, picture: null, roleType: 2 }, id: '7001', title: '新文章：文言文阅读技巧', type: 2, creationTime: '2026-09-01 10:05:00' }] } }
  },

  /* ---------------- 测评 ---------------- */
  {
    tag: '测评', method: 'POST', path: '/api/services/app/Task/GetStudentTaskListAsync', summary: '分页拉取学生测评任务列表', auth: true,
    desc: `分页获取当前学生的测评任务。\n\n**请求体**：maxResultCount（页大小，默认 20）、skipCount（偏移）、taskListType（列表类型，默认 4）。\n**返回 result**：分页对象 { totalCount, items: ExamTask[] }。item 含 examId、testPagerId、examTaskId、examName、examState 等。`,
    body: { type: 'object', properties: {
      maxResultCount: { type: 'integer', default: 20 }, skipCount: { type: 'integer', default: 0 }, taskListType: { type: 'integer', default: 4 }
    } },
    bodyExamples: [{ name: '第一页', summary: '拉取测评列表', value: { maxResultCount: 20, skipCount: 0, taskListType: 4 } }],
    returns: { wrap: 'abp', result: { totalCount: 60, items: [{ examId: 3001, testPagerId: 2001, examTaskId: 1001, examName: '高三一模数学', examState: 1 }] } }
  },
  {
    tag: '测评', method: 'GET', path: '/api/services/app/Task/GetExamTaskAsync', summary: '测评任务详情（含题目分组）', auth: true,
    desc: `获取某测评任务的详情，含题目分组结构（groups → questions）。\n\n**请求参数**：id（query，examTaskId）。\n**返回 result**：结构较复杂（含 groups 分组、questions 题目），此处给出示例骨架；题目 HTML 需再调 /Question/View/{qstId} 获取。`,
    params: [{ name: 'id', in: 'query', required: true, schema: { type: 'integer' }, description: '测评任务 id', example: 1001 }],
    returns: { wrap: 'abp', result: { examName: '高三一模数学', groups: [{ groupName: '选择题', questions: [{ id: 50001, type: 1, score: 5 }] }] } }
  },
  {
    tag: '测评', method: 'GET', path: '/Question/View/{qstId}', summary: '单题 HTML（含解析）', auth: true,
    desc: `获取单道题目的完整 HTML（题干 + 答案 + 解析 + 知识点），showAnalysis=true 含解析。\n\n**返回**：text/html 纯文本（非 JSON），需 DOMParser 解析提取 .stem/.answers/.analysis。`,
    params: [{ name: 'qstId', in: 'path', required: true, schema: { type: 'integer' }, description: '题目 id', example: 50001 }],
    returns: { wrap: 'raw', result: '<div class="stem">题干...</div><div class="answers"><h3>答案</h3>...</div><div class="analysis"><h3>解析</h3>...</div>' }
  },
  {
    tag: '测评', method: 'GET', path: '/api/services/app/LearningSituations/GetExamOverviewAsync', summary: '考试概览', auth: true,
    headers: ['AppName', 'AppVersion'],
    desc: `获取考试整体概览数据。\n\n**请求头**：AppName=WebClient、AppVersion=0。\n**请求参数**：examId（query）。\n**返回 result**：考试概览（得分/排名/正确率等，结构为 any，此处给示例骨架）。`,
    params: [{ name: 'examId', in: 'query', required: true, schema: { type: 'integer' }, description: '考试 id', example: 3001 }],
    returns: { wrap: 'abp', result: { examId: 3001, totalScore: 150, avgScore: 92.5, rank: 12, correctRate: 0.83 } }
  },
  {
    tag: '测评', method: 'GET', path: '/api/services/app/LearningSituations/GetQuestionAnalysisAsync', summary: '题目分析', auth: true,
    headers: ['AppName', 'AppVersion'],
    desc: `获取某考试下题目的逐题分析。\n\n**请求头**：AppName=WebClient、AppVersion=0。\n**请求参数**：examId（query）。\n**返回 result**：题目分析列表（any，示例骨架）。`,
    params: [{ name: 'examId', in: 'query', required: true, schema: { type: 'integer' }, description: '考试 id', example: 3001 }],
    returns: { wrap: 'abp', result: [{ qstId: 50001, rightCount: 30, wrongCount: 5, difficulty: 0.6 }] }
  },
  {
    tag: '测评', method: 'GET', path: '/api/services/app/Exam/ExportObjectiveAnswersAsync', summary: '导出客观题答案 xlsx（返回 Blob）', auth: true,
    desc: `导出某考试客观题答案为 xlsx 文件。\n\n**请求参数**：examId（query）。\n**返回**：application/octet-stream 二进制文件流（xlsx），需用 Blob 接收下载。`,
    params: [{ name: 'examId', in: 'query', required: true, schema: { type: 'integer' }, description: '考试 id', example: 3001 }],
    returns: { wrap: 'binary' }
  },

  /* ---------------- 优客畅学 ---------------- */
  {
    tag: '优客畅学', method: 'GET', path: '/SelfStudy/api/Learn/LearningCourses', summary: '分页拉取全部在学课程', auth: true,
    desc: `分页拉取当前学生的全部在学课程（前端会逐页 while 拉全）。\n\n**请求参数**：page（从 1 开始）。\n**返回约定**：包装为 { data: LessonCourse[] }（注意：非 ABP 包装）。item 含 id、title、status(0=已下架)、cover、progress、userName、subjectName。`,
    params: [{ name: 'page', in: 'query', required: true, schema: { type: 'integer' }, description: '页码，从 1 开始', example: 1 }],
    returns: { wrap: 'self', result: [{ id: 8001, title: '高中数学同步课', status: 1, cover: 'http://.../cover.png', progress: 45, userName: '王老师', subjectName: '数学' }] }
  },
  {
    tag: '优客畅学', method: 'GET', path: '/SelfStudy/api/Learn/CourseDetail', summary: '课程章节目录', auth: true,
    desc: `获取某课程的章节目录树。\n\n**请求参数**：id（query，课程 id）。\n**返回约定**：{ data: { catalogs: LessonCatalog[] } }。catalog 为树形（id、title、isLeaf、children）。`,
    params: [{ name: 'id', in: 'query', required: true, schema: { type: 'integer' }, description: '课程 id', example: 8001 }],
    returns: { wrap: 'self', result: { catalogs: [{ id: 'c1', title: '第一章', isLeaf: false, children: [{ id: 'c1-1', title: '1.1 函数', isLeaf: true }] }] } }
  },
  {
    tag: '优客畅学', method: 'GET', path: '/SelfStudy/api/learn/readContent', summary: '读取章节内容（HTML）', auth: true,
    desc: `读取某个章节节点的内容（HTML 字符串）。\n\n**请求参数**：catalogId（章节 id，字符串）、courseId（课程 id）。\n**返回约定**：{ data: { content: '<html>...</html>' } }。`,
    params: [
      { name: 'catalogId', in: 'query', required: true, schema: { type: 'string' }, description: '章节节点 id', example: 'c1-1' },
      { name: 'courseId', in: 'query', required: true, schema: { type: 'integer' }, description: '课程 id', example: 8001 }
    ],
    returns: { wrap: 'self', result: { content: '<h1>1.1 函数</h1><p>章节正文 HTML...</p>' } }
  },

  /* ---------------- 错题本 ---------------- */
  {
    tag: '错题本', method: 'GET', path: '/api/services/app/MistakeBook/GetMyMistakeBooksAsync', summary: '获取我的错题本列表', auth: true,
    desc: `获取当前用户的所有错题本。\n\n**返回 result**：MistakeBook[]，每项含 id、topic{content} 等。`,
    returns: { wrap: 'abp', result: [{ id: 'mb_001', topic: { content: '数学错题本' } }] }
  },
  {
    tag: '错题本', method: 'POST', path: '/api/services/app/MistakeBook/SearchMistakeQstItemsAsync', summary: '搜索错题列表', auth: true,
    desc: `按错题本筛选错题（支持难度/错误原因/标签等过滤）。\n\n**请求体**：bookId 必填；attainedLevel/diff/errorReason/tagIdList 为筛选数组（默认空）；haveNoTag 默认 false；分页 maxResultCount(默认200)/skipCount。\n**返回 result**：{ totalCount, items: MistakeItem[] }。item 含 id、source、stemShoot(题干截图)、creationTime。`,
    body: { type: 'object', required: ['bookId'], properties: {
      attainedLevel: { type: 'array', items: { type: 'string' } }, bookId: { type: 'string', example: 'mb_001' }, diff: { type: 'array', items: { type: 'string' } },
      errorReason: { type: 'array', items: { type: 'string' } }, haveNoTag: { type: 'boolean', default: false },
      maxResultCount: { type: 'integer', default: 200 }, skipCount: { type: 'integer', default: 0 }, tagIdList: { type: 'array', items: { type: 'string' } }
    } },
    bodyExamples: [{ name: '查全部', summary: '拉取错题本全部错题', value: { bookId: 'mb_001', attainedLevel: [], diff: [], errorReason: [], haveNoTag: false, maxResultCount: 200, skipCount: 0, tagIdList: [] } }],
    returns: { wrap: 'abp', result: { totalCount: 18, items: [{ id: 'mi_001', source: '数学', stemShoot: 'http://.../stem.png', creationTime: '2026-09-10 14:00:00' }] } }
  },
  {
    tag: '错题本', method: 'POST', path: '/api/services/app/MistakeBook/MultiRemoveMistakeItemsAsync', summary: '批量移除错题', auth: true,
    headers: ['AppName', 'AppVersion'],
    desc: `从错题本批量删除错题（移至回收站，非永久删除）。\n\n**请求头**：AppName=WebClient、AppVersion=0。\n**请求体**：bookId、itemIds[]（错题条目 id，非题目 id）。\n**返回 result**：null。`,
    body: { type: 'object', required: ['bookId', 'itemIds'], properties: {
      bookId: { type: 'integer', example: 1001 }, itemIds: { type: 'array', items: { type: 'integer' }, example: [2001, 2002] }
    } },
    bodyExamples: [{ name: '批量删', summary: '删除两条错题', value: { bookId: 1001, itemIds: [2001, 2002] } }],
    returns: { wrap: 'abp', result: null }
  },
  {
    tag: '错题本', method: 'GET', path: '/api/services/app/MistakeBook/GetMistakeQstItemDetailInfoAsync', summary: '获取错题详情', auth: true,
    desc: `获取单条错题的详情。\n\n**请求参数**：itemId（query）。\n**返回 result**：MistakeDetail（含 qstPath 题目路径、note 笔记、pictureNote 图片笔记数组），无数据时返回 null。`,
    params: [{ name: 'itemId', in: 'query', required: true, schema: { type: 'string' }, description: '错题条目 id', example: 'mi_001' }],
    returns: { wrap: 'abp', result: { qstPath: '/Question/View/50001', note: 'http://.../note', pictureNote: ['http://.../p1.png'] } }
  },

  /* ---------------- 云笔记（CloudNotes，AES-ECB 加密） ---------------- */
  {
    tag: '云笔记', method: 'GET', path: '/CloudNotes/api/Notes/GetByParentId', summary: '按父目录获取笔记/子目录', auth: true,
    desc: `获取某父目录下的笔记与子目录列表。\n\n⚠️ **参数加密**：query 整体经 AES-ECB（当日动态密钥）加密后以密文透传，形如 ` + '`?=<密文>`' + `。解密后原串：` + '`parentid=0&isNoteNode=true`' + `。\n**返回约定**：{ code, data, msg }，data 为 AES 密文，解密后为 { noteList: NoteItem[] }。NoteItem 含 fileId、fileName、type(0=文件夹,1/12=笔记)、createTime。` + CLOUDNOTE_TAG_DESC,
    params: [
      { name: 'parentid', in: 'query', required: true, schema: { type: 'string' }, description: '父目录 id（默认 0=根），实际为 AES 密文', example: '<AES-ECB密文>' },
      { name: 'isNoteNode', in: 'query', required: true, schema: { type: 'boolean', default: true }, description: '是否为笔记节点查询（实际随密文透传）', example: true }
    ],
    returns: { wrap: 'cn', result: null }
  },
  {
    tag: '云笔记', method: 'GET', path: '/CloudNotes/api/Notes/GetAll', summary: '获取全部笔记节点', auth: true,
    desc: `获取当前用户全部笔记节点（含文件夹与笔记）。\n\n**返回约定**：{ code, data, msg }，data 为 AES 密文，解密后为 { noteList: NoteItem[] }。前端据此过滤 type（1/12 为笔记，0 为文件夹，isRecycleBin 区分回收站）。`,
    returns: { wrap: 'cn', result: null }
  },
  {
    tag: '云笔记', method: 'POST', path: '/CloudNotes/api/Notes/Delete', summary: '删除回收站笔记', auth: true,
    desc: `永久删除回收站中的笔记（注意：与 MoveToRecycleBin 不同，此为永久删除）。\n\n⚠️ **请求体加密**：body 为 AES-ECB 加密后的文件 ID 数组（List<String>），形如 ["f001","f002"] 加密后的密文。\n**返回约定**：{ code, data, msg }。`,
    body: { type: 'string', description: 'AES-ECB 加密后的文件 ID 数组密文（明文为 JSON 字符串 ["f001"]）' },
    bodyExamples: [{ name: '删除密文', summary: 'body 为加密密文', value: '<AES-ECB密文>' }],
    returns: { wrap: 'cn', result: null }
  },
  {
    tag: '云笔记', method: 'POST', path: '/CloudNotes/api/Notes/MoveToRecycleBin', summary: '移动笔记到回收站', auth: true,
    desc: `将笔记移入回收站（可恢复）。\n\n⚠️ **请求体加密**：body 为 AES-ECB 加密后的文件 ID 数组密文。\n**返回约定**：{ code, data, msg }。`,
    body: { type: 'string', description: 'AES-ECB 加密后的文件 ID 数组密文' },
    bodyExamples: [{ name: '移入回收站', summary: 'body 为加密密文', value: '<AES-ECB密文>' }],
    returns: { wrap: 'cn', result: null }
  },
  {
    tag: '云笔记', method: 'POST', path: '/CloudNotes/api/Notes/Update', summary: '更新/重命名/移动笔记节点', auth: true,
    desc: `更新笔记节点（重命名、移动 parentId、修改属性）。\n\n⚠️ **请求体加密**：body 为 AES-ECB 加密后的笔记节点对象。对象至少含 fileId、fileUrl、parentId、type、version、shared、isRecycleBin、expirationTimeStamp；重命名时只改 fileName。\n**返回约定**：{ code, data, msg }，解密后含更新后的 version。`,
    body: { type: 'string', description: 'AES-ECB 加密后的笔记节点对象密文（明文为 JSON 对象）' },
    bodyExamples: [{ name: '更新节点', summary: 'body 为加密密文', value: '<AES-ECB密文>' }],
    returns: { wrap: 'cn', result: null }
  },
  {
    tag: '云笔记', method: 'GET', path: '/CloudNotes/api/Notes/Search', summary: '关键词搜索笔记', auth: true,
    desc: `按文件名关键词搜索笔记。\n\n⚠️ **参数加密**：query 整体 AES-ECB 加密，解密后原串 ` + '`fileName=数学`' + `。\n**返回约定**：{ code, data, msg }，data 密文解密后为 { noteList: NoteItem[] }（仅 type 1/12 且非回收站）。`,
    params: [{ name: 'fileName', in: 'query', required: true, schema: { type: 'string' }, description: 'AES 加密后的关键词', example: '<AES-ECB密文>' }],
    returns: { wrap: 'cn', result: null }
  },
  {
    tag: '云笔记', method: 'GET', path: '/CloudNotes/api/Resources/GetByFileId', summary: '按 fileId 获取图片资源列表', auth: true,
    desc: `获取某笔记文件的图片资源列表（每页 9 张固定结构）。\n\n⚠️ **参数加密**：query 整体 AES-ECB 加密，解密后原串 ` + '`fileId=<fileId>`' + `。\n**返回约定**：{ code, data, msg }，data 密文解密后为 { resourceList: NoteResource[] }。NoteResource 含 ossImageUrl、pageIndex、resourceType(0=图片,1/2=模板)。`,
    params: [{ name: 'fileId', in: 'query', required: true, schema: { type: 'string' }, description: 'AES 加密后的 fileId', example: '<AES-ECB密文>' }],
    returns: { wrap: 'cn', result: null }
  },
  {
    tag: '云笔记', method: 'POST', path: '/CloudNotes/api/Resources/AddOrUpdate', summary: '保存笔记资源列表', auth: true,
    desc: `保存某笔记的全部图片/模板资源清单（PDF 上传流程的收尾步骤）。\n\n⚠️ **请求体加密**：body 为 AES-ECB 加密后的资源数组密文。每个资源含 id、fileId、pageName、pageIndex、md5、resourceType、ossImageUrl 等。\n**返回约定**：{ code, data, msg }。`,
    body: { type: 'string', description: 'AES-ECB 加密后的资源数组密文（明文为 JSON 数组）' },
    bodyExamples: [{ name: '保存资源', summary: 'body 为加密密文', value: '<AES-ECB密文>' }],
    returns: { wrap: 'cn', result: null }
  },
  {
    tag: '云笔记', method: 'POST', path: '/CloudNotes/api/Notes/AddOrUpdate', summary: '保存笔记', auth: true,
    desc: `登记/创建笔记节点（PDF 上传后调用）。\n\n⚠️ **请求体加密**：body 为 AES-ECB 加密后的笔记对象密文，明文形如 { fileId, fileName, parentId:"0", type:"12", fileUrl }。\n**返回约定**：{ code, data, msg }。`,
    body: { type: 'string', description: 'AES-ECB 加密后的笔记对象密文' },
    bodyExamples: [{ name: '保存笔记', summary: 'body 为加密密文', value: '<AES-ECB密文>' }],
    returns: { wrap: 'cn', result: null }
  },

  /* ---------------- 图库 ---------------- */
  {
    tag: '图库', method: 'GET', path: '/api/services/app/PictureLibrary/GetAllPicturesFromLibrary', summary: '分页拉取图库', auth: true,
    desc: `分页获取图库图片（isRecycleBin=false 正常，true 回收站）。\n\n**请求参数**：SkipCount、MaxResultCount、IsRecycleBin。\n**返回 result**：{ items: PictureItem[], totalCount }。item 含 picture(图片URL)、name、size、createTime。`,
    params: [
      { name: 'SkipCount', in: 'query', schema: { type: 'integer', default: 0 }, example: 0 },
      { name: 'MaxResultCount', in: 'query', schema: { type: 'integer', default: 20 }, example: 20 },
      { name: 'IsRecycleBin', in: 'query', schema: { type: 'boolean', default: false }, example: false }
    ],
    returns: { wrap: 'abp', result: { items: [{ picture: 'http://.../p.png', name: '笔记1.png', size: '12345', createTime: '2026-09-01 10:00:00' }], totalCount: 50 } }
  },
  {
    tag: '图库', method: 'POST', path: '/api/services/app/PictureLibrary/AddPictureAsync', summary: '上传后登记图片到图库', auth: true,
    headers: ['AppName', 'AppVersion'],
    desc: `上传图片后，向图库登记记录。\n\n**请求头**：AppName=com.zykj.manage、AppVersion=32。\n**请求体**：picture(图片URL)、name、size。\n**返回 result**：通常为 null（登记成功即可）。`,
    body: { type: 'object', required: ['picture', 'name', 'size'], properties: {
      picture: { type: 'string', example: 'http://.../p.png' }, name: { type: 'string', example: '笔记1.png' }, size: { type: 'string', example: '12345' }
    } },
    bodyExamples: [{ name: '登记图片', summary: '登记一条图库记录', value: { picture: 'http://.../p.png', name: '笔记1.png', size: '12345' } }],
    returns: { wrap: 'abp', result: null }
  },

  /* ---------------- 随身答 ---------------- */
  {
    tag: '随身答', method: 'GET', path: '/api/services/app/Quora/GetCatalogs', summary: '获取领域（catalog）列表', auth: true,
    desc: `获取问答领域（catalog）列表，用于筛选会话。\n\n**返回 result**：QuoraCatalog[]，每项含 id、name。`,
    returns: { wrap: 'abp', result: [{ id: 1, name: '数学答疑' }] }
  },
  {
    tag: '随身答', method: 'POST', path: '/api/services/app/Quora/GetSessions', summary: '获取会话列表（懒加载）', auth: true,
    desc: `按条件懒加载问答会话列表。\n\n**请求体**：keyword、catalogId、topicId、orderBy、skip、take、updateTime{start,end}、joinTime{start,end}、justWatch[]。\n**返回 result**：QuoraSession[]，含 id、askUserName、summary、snapshot、topicName、unRead 等。`,
    body: { type: 'object', required: ['keyword', 'catalogId', 'topicId', 'orderBy', 'skip', 'take', 'updateTime', 'joinTime', 'justWatch'],
      properties: {
        keyword: { type: 'string', example: '' }, catalogId: { type: 'integer', example: 1 }, topicId: { type: 'integer', example: 0 }, orderBy: { type: 'integer', example: 0 },
        skip: { type: 'integer', example: 0 }, take: { type: 'integer', example: 20 },
        updateTime: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
        joinTime: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
        justWatch: { type: 'array', items: { type: 'integer' } }
      } },
    bodyExamples: [{ name: '拉取会话', summary: '默认条件', value: { keyword: '', catalogId: 1, topicId: 0, orderBy: 0, skip: 0, take: 20, updateTime: { start: '', end: '' }, joinTime: { start: '', end: '' }, justWatch: [] } }],
    returns: { wrap: 'abp', result: [{ id: 's_001', askUserName: '张三', summary: '函数定义域问题', snapshot: 'http://.../snap.png', topicName: '数学答疑', unRead: true }] }
  },
  {
    tag: '随身答', method: 'POST', path: '/api/services/app/Quora/GetMessages', summary: '获取某会话的消息', auth: true,
    desc: `获取某会话的全部消息（画板内容）。\n\n**请求体**：SessionId、Skip(默认0)、Take(默认1000)。\n**返回 result**：QuoraMessage[]，含 id、sessionId、userName、sendTime、snapShot、content、isPrimary。`,
    body: { type: 'object', required: ['SessionId'], properties: {
      SessionId: { type: 'string', example: 's_001' }, Skip: { type: 'integer', default: 0 }, Take: { type: 'integer', default: 1000 }
    } },
    bodyExamples: [{ name: '拉消息', summary: '取会话消息', value: { SessionId: 's_001', Skip: 0, Take: 1000 } }],
    returns: { wrap: 'abp', result: [{ id: 'm_001', sessionId: 's_001', userName: '张三', sendTime: '2026-09-01 11:00:00', snapShot: 'http://.../s.png', content: '<canvas-data>', isPrimary: true }] }
  },
  {
    tag: '随身答', method: 'GET', path: '/api/services/app/Quora/ResetReadState', summary: '重置已读状态', auth: true,
    desc: `进入会话后重置其未读状态。\n\n**请求参数**：sessionId（query）。\n**返回 result**：null。`,
    params: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' }, description: '会话 id', example: 's_001' }],
    returns: { wrap: 'abp', result: null }
  },
  {
    tag: '随身答', method: 'POST', path: '/api/services/app/Quora/AddMessage', summary: '发送画板回复', auth: true,
    desc: `向会话发送一条画板回复。\n\n**请求体**：content（画板内容）、sessionId、snapshot（缩略图）。\n**返回 result**：null。`,
    body: { type: 'object', required: ['content', 'sessionId', 'snapshot'], properties: {
      content: { type: 'string', example: '<canvas-data>' }, sessionId: { type: 'string', example: 's_001' }, snapshot: { type: 'string', example: 'http://.../s.png' }
    } },
    bodyExamples: [{ name: '发回复', summary: '发送画板消息', value: { content: '<canvas-data>', sessionId: 's_001', snapshot: 'http://.../s.png' } }],
    returns: { wrap: 'abp', result: null }
  },

  /* ---------------- 领创 Linspirer（第三方，base 不同，AES-CBC 加密） ---------------- */
  {
    tag: '领创 Linspirer（第三方）', method: 'POST', path: `${LINSPIRER_BASE}/public-interface.php`, summary: '领创·统一 JSON-RPC 接口', auth: false,
    desc: `领创（Linspirer）第三方接口，所有业务共用同一个 URL 与 POST 方法，靠请求体中的 ` + '`method`' + ` 字段区分。\n\n` +
      `**请求体（JSON-RPC 信封）**：\n- id：固定 1\n- !version：6\n- jsonrpc："2.0"\n- is_encrypt：true\n- client_version：zhongyukejiao_hem_6.10.004.6\n- method：业务方法名（见下方 4 个示例）\n- params：业务参数 JSON **经 AES-CBC（固定密钥/IV）加密后的密文**\n\n` +
      `**4 个业务方法**（下方请求示例分别对应）：\n1. ` + '`com.linspirer.device.setdevice`' + ` 绑定设备\n2. ` + '`com.linspirer.tactics.gettactics`' + ` 获取全部应用（策略+兴趣）\n3. ` + '`com.linspirer.app.getdetail`' + ` 获取应用详情\n4. ` + '`com.linspirer.user.getuserinfo`' + ` 获取用户信息（用于密码计算）\n\n` +
      `**返回约定**：{ code, data, msg }；data 可能加密或明文（code=0 成功）。\n⚠️ 调试时需在 Apifox 配置 AES-CBC 前置脚本对 params 加密、对 data 解密：` + LIN_TAG_DESC,
    body: { type: 'object', description: 'JSON-RPC 信封（id/!version/jsonrpc/is_encrypt/client_version/method/params）。params 为 AES-CBC 密文。' },
    bodyExamples: [
      { name: '绑定设备', summary: 'method=com.linspirer.device.setdevice', value: { id: 1, '!version': 6, jsonrpc: '2.0', is_encrypt: true, client_version: 'zhongyukejiao_hem_6.10.004.6', method: 'com.linspirer.device.setdevice', params: '<AES-CBC密文，明文: {brand:"",deviceid:"",email:"user@x.com",isrooted:false,model:"",...}>' } },
      { name: '获取全部应用', summary: 'method=com.linspirer.tactics.gettactics', value: { id: 1, '!version': 6, jsonrpc: '2.0', is_encrypt: true, client_version: 'zhongyukejiao_hem_6.10.004.6', method: 'com.linspirer.tactics.gettactics', params: '<AES-CBC密文，明文: {swdid,email,model,launcher_version}>' } },
      { name: '获取应用详情', summary: 'method=com.linspirer.app.getdetail', value: { id: 1, '!version': 6, jsonrpc: '2.0', is_encrypt: true, client_version: 'zhongyukejiao_hem_6.10.004.6', method: 'com.linspirer.app.getdetail', params: '<AES-CBC密文，明文: {swdid,email,model,launcher_version,appid}>' } },
      { name: '获取用户信息', summary: 'method=com.linspirer.user.getuserinfo', value: { id: 1, '!version': 6, jsonrpc: '2.0', is_encrypt: true, client_version: 'zhongyukejiao_hem_6.10.004.6', method: 'com.linspirer.user.getuserinfo', params: '<AES-CBC密文，明文: {swdid,email,model,launcher_version}>' } }
    ],
    returns: { wrap: 'lin', result: { app_tactics: { applist: [] }, interest_applist: [] } }
  }
]

/* ----------------------------- 生成 OpenAPI ----------------------------- */
const paths = {}
let operations = 0

function buildResponse(ret) {
  if (!ret) return undefined
  if (ret.wrap === 'binary') {
    return { '200': { description: 'xlsx 文件流（application/octet-stream）', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } } }
  }
  if (ret.wrap === 'raw') {
    return { '200': { description: '题目 HTML 文本（text/html）', content: { 'text/html': { schema: { type: 'string' }, example: ret.result } } } }
  }
  const ex = ret.wrap === 'disc' ? ret.result
    : ret.wrap === 'abp' ? abp(ret.result)
    : ret.wrap === 'self' ? selfstudy(ret.result)
    : ret.wrap === 'cn' ? cloudnotes()
    : ret.wrap === 'lin' ? linspirer(ret.result)
    : ret.result
  return { '200': { description: '成功响应示例（按真实返回包装约定）', content: { 'application/json': { schema: { type: 'object' }, example: ex } } } }
}

for (const o of ops) {
  const key = o.path
  if (!paths[key]) paths[key] = {}
  const parameters = [...(o.params || [])].map(p => ({
    name: p.name, in: p.in, required: p.required !== false, description: p.description || '',
    schema: p.schema, ...(p.example !== undefined ? { example: p.example } : {})
  }))
  const opObj = {
    tags: [o.tag], summary: o.summary, description: o.desc || '',
    operationId: `${o.method.toLowerCase()}_${o.path.replace(/[^a-zA-Z0-9]/g, '_')}`
  }
  if (o.auth) opObj.security = bearer
  if (o.headers && o.headers.length) {
    opObj.description += `\n\n**自定义请求头**：${o.headers.map(h => '`' + h + '`').join('、')}`
  }
  if (parameters.length) opObj.parameters = parameters
  if (o.body) {
    const content = { 'application/json': { schema: o.body } }
    if (o.bodyExamples && o.bodyExamples.length) {
      content['application/json'].examples = Object.fromEntries(
        o.bodyExamples.map(e => [e.name, { summary: e.summary || '', value: e.value }])
      )
    }
    opObj.requestBody = { content, required: true }
  }
  const resp = buildResponse(o.returns)
  if (resp) opObj.responses = resp
  paths[key][o.method.toLowerCase()] = opObj
  operations++
}

const spec = {
  openapi: '3.0.3',
  info: { title: '中育工具箱 API', version: '1.2.0-aoki', description:
    '从中育工具箱前端源码汇总的 REST 接口（含返回结构说明与请求/响应样例）。\n\n' +
    '主 API 基地址（学校 discover 返回的 server）默认 ' + API_BASE + '；嵌入页 webServer 基地址（navPage.html / index.html）默认 http://sxz.school.zykj.org（与 REST 不同域，不在本规范内）。领创 Linspirer 为第三方域 ' + LINSPIRER_BASE + '。\n\n' +
    '**返回包装约定**：中育 ABP 接口包 {success,result,error,unAuthorizedRequest,__abp}；优客畅学包 {data}；云笔记包 {code,data,msg}（data 为 AES-ECB 密文）；领创包 {code,data,msg}（params 为 AES-CBC 密文）。' },
  servers: [{ url: API_BASE, description: '中育学校 API（discover 返回的 server）' }],
  securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
  tags: [
    { name: '认证与账户', description: '登录、令牌刷新、用户信息、学校发现。返回为 ABP 包装 {success,result,error,unAuthorizedRequest,__abp}。' },
    { name: '在线专栏', description: '专栏/文章/收藏夹/消息。ABP 包装。' },
    { name: '测评', description: '测评任务、题目 HTML、考试概览/分析、答案 xlsx 导出。ABP 包装。' },
    { name: '优客畅学', description: '在学课程、章节目录、章节内容。注意返回包装为 {data}（非 ABP）。' },
    { name: '错题本', description: '错题本与错题的查询/删除/详情。ABP 包装。' },
    { name: '云笔记', description: CLOUDNOTE_TAG_DESC },
    { name: '图库', description: '图库图片列表与上传登记。ABP 包装。' },
    { name: '随身答', description: '问答领域/会话/消息。ABP 包装。' },
    { name: '领创 Linspirer（第三方）', description: LIN_TAG_DESC }
  ],
  paths
}

const out = join(__dirname, 'zhongyu-api.openapi.json')
writeFileSync(out, JSON.stringify(spec, null, 2), 'utf8')

console.log(JSON.stringify({
  paths: Object.keys(paths).length, operations, file: out
}, null, 2))
