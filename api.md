# 本版本新增接口合约

只记载公开路径和字段，不包含真实 Token、账号、学生数据或抓包正文。常规接口实现见 src/api。

## 云笔记

依据 [上游 issue #3](https://github.com/Loshop-Studio/ZhongYuToolBox_Web/issues/3)。使用当前学校官方 server，正文采用每日中育 AES 加密。

- POST /CloudNotes/api/Notes/MoveToRecycleBin：加密的 fileId 字符串数组。
- POST /CloudNotes/api/Notes/Update：从当前服务端笔记对象保留 fileId、fileUrl、parentId、type、version、shared、isRecycleBin、expirationTimeStamp 等字段；重命名只改变 fileName，移动只改变 parentId。不传 noteList/createTime/updateTime。服务端 code=0 才记录操作成功。
- 批量移动前 GET /CloudNotes/api/Notes/GetAll 重新读取最新节点及版本；确认目标是有效文件夹或根目录，依次 Update，分别反馈成功、跳过和失败。没有使用未经验证的 Move 接口，也没有假定整批是原子事务。
- 不调用 Notes/Delete，不实现永久删除。回收站恢复使用官方客户端。

## 本人测评错题

依据用户提供的新测评 2.1.5 官方 APK 的 API 定义和真实客户端调用参数。

- POST /api/services/app/Task/GetStudentTaskListAsync：maxResultCount、skipCount、taskListType。官方 APK 定义：已完成=4，待处理=1，全部=2。
- GET /api/services/app/Task/GetExamTaskAsync?id={taskId}：当前账号的任务详情。
- GET /api/services/app/LearningSituations/GetQuestionAnalysisAsync?examId={examId}：题目分析，递归读取 testGroupAnalysis/testQuestionAnalysis/childrenAnalysis，以 errorStudents 中的当前学生 userId 判断错题，questionId 与任务题目 ID 匹配。不能匹配的题目会提示并阻止导入。
- GET /api/services/app/Task/GetQuestionViewAsync?examId={examId}&questionId={questionId}：单题内容及 isInMistakeBook。
- GET /api/services/app/Task/GetRelatedQstViewAsync?examId={examId}&relatedGroupId={groupId}：关联组详情。
- POST /api/services/app/MistakeBook/AddInMistakeBookAsync：JSON 正文 examId、isRelatedGroup、questionId、extraStems、stemShoot、diff、attainedLevel、errorReason、tagIdList。关联题组使用 groupId 作为 questionId，与官方原生导航相同。

客户端先本地保存题干；尚未加入官方错题本时，本机渲染题干截图，通过官方 ObjectStorage/GenerateTokenV2Async 获取 mistake_v2（fc=4）STS 并上传，然后提交非空 stemShoot。这个过程不要求图库客户端。

流程：已完成作业 → 题目分析（只读取并识别）→ 返回新测评 → 加入官方错题本（写入）。写入前重新读取分析，确认候选题仍属于本人错题；不根据个人得分、学生姓名或班级错误人数推测。不再展示独立本地错题本；按账号保存的审核及失败重试缓存只服务于官方同步。

## 错题本导出

- GET /api/services/app/MistakeBook/GetMyMistakeBooksAsync。
- POST /api/services/app/MistakeBook/SearchMistakeQstItemsAsync：bookId、skipCount、maxResultCount 及空筛选项，按科目遍历分页。
- GET /api/services/app/MistakeBook/GetMistakeQstItemDetailInfoAsync?itemId={id}。

题干和图片读取后在本机生成 A4 PDF，支持长题续页。读取非学校 origin 资源不携带账号 Bearer Token。同步新增和云笔记修改已做模拟合约回归，尚未使用真实账号执行这些写操作。
