# 本版本新增接口合约

只记载公开路径和字段，不包含真实 Token、账号、学生数据或抓包正文。常规接口实现见 src/api。

## 云笔记

依据 [上游 issue #3](https://github.com/Loshop-Studio/ZhongYuToolBox_Web/issues/3)。使用当前学校官方 server，正文采用每日中育 AES 加密。

- POST /CloudNotes/api/Notes/MoveToRecycleBin：加密的 fileId 字符串数组。
- POST /CloudNotes/api/Notes/Update：从当前服务端笔记对象保留 fileId、fileUrl、parentId、type、version、shared、isRecycleBin、expirationTimeStamp 等字段；重命名只改变 fileName，移动只改变 parentId。不传 noteList/createTime/updateTime。服务端 code=0 才记录操作成功。
- 批量移动前 GET /CloudNotes/api/Notes/GetAll 重新读取最新节点及版本；确认目标是有效文件夹或根目录，依次 Update，分别反馈成功、跳过和失败。没有使用未经验证的 Move 接口，也没有假定整批是原子事务。
- GET /CloudNotes/api/Notes/GetAll 包含 isRecycleBin 节点；回收站列表筛选 isRecycleBin=true 且 type=1/12。
- POST /CloudNotes/api/Notes/Delete：AES 加密的 fileId 字符串数组。依据官方云笔记 1.9.38 APK 的接口注解及 List<String> 参数，与官方 SelfStudy 网页调用交叉核对。提交前重新读取回收站，拒绝已恢复或不存在的笔记，账号切换 / 取消不提交，code 非 0 不记录成功。支持单条与多选永久删除，确认后提交；恢复仍使用官方客户端。

## 本人测评错题

依据用户提供的新测评 2.1.5 官方 APK 的 API 定义和真实客户端调用参数。

- POST /api/services/app/Task/GetStudentTaskListAsync：maxResultCount、skipCount、taskListType。官方 APK 定义：已完成=4，待处理=1，全部=2。
- GET /api/services/app/Task/GetExamTaskAsync?id={taskId}：当前账号的任务详情。
- GET /api/services/app/LearningSituations/GetQuestionAnalysisAsync?examId={examId}：题目分析，递归读取 testGroupAnalysis/testQuestionAnalysis/childrenAnalysis，以 errorStudents 中的当前学生 userId 判断错题，questionId 与任务题目 ID 匹配。不能匹配的题目会提示并阻止导入。
- GET /api/services/app/Task/GetQuestionViewAsync?examId={examId}&questionId={questionId}：单题内容及 isInMistakeBook。
- GET /api/services/app/Task/GetRelatedQstViewAsync?examId={examId}&relatedGroupId={groupId}：关联组详情。
- POST /api/services/app/MistakeBook/AddInMistakeBookAsync：JSON 正文 examId、isRelatedGroup、questionId、extraStems、stemShoot、diff、attainedLevel、errorReason、tagIdList。关联题组使用 groupId 作为 questionId，与官方原生导航相同。

客户端先本地保存题干；尚未加入官方错题本时，本机渲染题干截图，通过官方 ObjectStorage/GenerateTokenV2Async 获取 mistake_v2（fc=4）STS 并上传，然后提交非空 stemShoot。这个过程不要求图库客户端。

流程：打开新测评的已完成作业列表 → 当前页顺序自动读取任务详情与题目分析 → 列表显示本人错题及加入按钮 → 点击加入官方错题本（写入）。翻页、重新进入页面或刷新后自动重新识别；取消或账号切换停止后续请求。单个作业读取失败不阻断队列，失败不沿用旧识别结果启用按钮。写入前再次读取分析，确认候选题仍属于本人错题；不根据个人得分、学生姓名或班级错误人数推测。不再展示独立本地错题本；按账号保存的审核及失败重试缓存只服务于官方同步。

## 官方错题删除与导出

- GET /api/services/app/MistakeBook/GetMyMistakeBooksAsync。
- POST /api/services/app/MistakeBook/SearchMistakeQstItemsAsync：bookId、skipCount、maxResultCount 及空筛选项，按科目遍历分页。
- GET /api/services/app/MistakeBook/GetMistakeQstItemDetailInfoAsync?itemId={id}。
- POST /api/services/app/MistakeBook/MultiRemoveMistakeItemsAsync：JSON 正文 `{ "bookId": 科目错题本编号, "itemIds": [错题条目编号] }`。依据错题本 APK 的 MistakeApi `retrofit2/http/POST` 注解和 MultiRemoveMistakeReq 的 `bookId: int`、`itemIds: ArrayList` 字段，并与已取得的 API schema 交叉核对。不是题目 questionId，也不是测评 examId。单题删除同样传单元素数组，提交前确认；空选择和无效 ID 不发送请求，官方 success=false 不记录成功。

题干和图片读取后在本机生成 A4 PDF，支持长题续页。选中导出只读取所选条目；本科全部导出遍历该科目分页。全部题目连续编号，答案与解析在题目部分结束后新开一页，沿用题号。读取非学校 origin 资源不携带账号 Bearer Token。同步新增、错题删除和云笔记修改已做模拟合约回归，未使用真实账号执行破坏性删除测试。

## 图库回收站限制

现有来源只核实了 PictureLibrary/GetAllPicturesFromLibrary 与 AddPictureAsync。用户提供的 APK 不包含图库客户端，公开资料未提供可验证的永久删除请求。本版本不猜测删除路径和参数，不发送图库永久删除请求。

PDF 排版使用 随包思源宋体，标准页宽下正文约 12 磅，1.5 倍行距，紧凑段落间距；长题优先利用当前页余量，空白行附近续页，答案部分仍另起一页。
## 中育学生应用下载

- GET `/api/services/app/AppStore/CheckUpdateAsync?packageName=<Android包名>&version=0&appType=0`：官方用户中心 APK 已核实 `packageName` / `version` / `appType` 参数。学生端使用 0；响应 `result` 包含 `name`、`packageName`、`versionName`、`versionCode`、`fileUrl`、`size`、`icon`、`disabled`。公开更新查询不携带账号 Token，也不登记设备或提交下载遥测。
- 查询当前登录学校 API；未登录时默认省锡中。`result=null` 或 `disabled=true` 不提供下载；包名、类型不匹配时拒绝使用响应。
- 从返回的中育资源地址下载 APK，核对记录大小和 APK 基本结构，生成本地 SHA-256。未验证平板安装、官方签名及账号课程权限。
