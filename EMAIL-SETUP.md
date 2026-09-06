# The Margins：欢迎邮件接通说明

这份代码基于 GitHub 仓库 `jzthenutellathieve/MarginsWebsite` 的 `a98ac3d` 版本整合了订阅后台和网页反馈，并通过本地模拟接口测试。**尚未部署到线上，尚未连接账号密钥，也没有验证真实邮件投递。** 网站已有的 Mailchimp 公开表单会继续作为备用入口。

## 这次解决什么

| 读者操作 | 配置完成后的处理 |
| --- | --- |
| 新邮箱点 Subscribe | 加入现有名单，并提交欢迎邮件事件 |
| 已订阅邮箱再次点 Subscribe | 提交新的欢迎邮件事件，无须手动加入流程 |
| 同一邮箱连续点击 | 提示等待，五分钟内不重复请求 |
| 已退订或等待确认的邮箱 | 打开 Mailchimp 表单完成确认，回到原网页时重新核对订阅状态并请求欢迎邮件 |
| 邮件服务报错或超时 | 显示请求未确认，不声称邮件已发送 |

读者关闭原网页后，可再次打开网站并提交已确认的邮箱。新文章的 RSS 自动通知是另外一项设置，见 `RSS-SETUP.md`，这次不宣称已启用。

## 1. 在现有 Vercel 项目部署完整代码

修改已整合到现有 GitHub 仓库。部署完整分支，包括 `content/`、`templates/`、`public/`、`api/`、`server/`、`newsletter-client.js`、`scripts/`、`package.json` 和 `vercel.json`。

保留现有 Vercel 项目与域名。项目根目录应为这些文件所在目录；构建命令为 `npm run build`，静态输出目录为 `dist`。`api/newsletter.js` 由 Vercel 作为 Node.js Function 部署。网站已改为独立静态页面，不存在的路径返回 404。`/api/newsletter` 必须返回 JSON，`/feed.xml` 必须返回 XML；若返回 HTML，说明对应资源没有正确部署。图片目录 `images/` 保留，`sitemap.xml` 在构建时生成。现有 `#/reporting/...` 链接会转到对应的 `/articles/.../` 页面。

这个仓库继续使用现有 Vercel 项目；没有加入另外的 GitHub Pages 发布流程。在仅支持静态页面的主机上，表单会回到原来的 Mailchimp 提交方式，无法运行新增后台。

## 2. 将欢迎邮件改为事件触发

现有触发条件 `Contact signs up` 不代表每次填写已订阅邮箱都会触发。使用 Mailchimp 的 **Event API** 触发器，事件名称必须逐字填写：

```text
margins_welcome_requested
```

在 Automations 中使用现有欢迎邮件的内容，建立或修改为下面这个流程：

1. `Choose a trigger → API & Integrations → Event API`，填写上述事件名称，Audience 使用现有的 `Xingtong Zou` 名单。
2. 后面连接一项 `Send email`，使用已经编辑好的 The Margins 欢迎邮件。
3. 开启 `Contacts can re-enter flow`，间隔设为 **5 Minutes**。
4. 邮件发送时间选择 **Every day as soon as possible**，流程和发送步骤都要处于启用状态。
5. 切换完成后，让这个事件流程作为新版网站欢迎邮件的唯一发送流程，避免旧的 `Signs up` 流程同时给新邮箱发送第二封。若修改现有流程，保留原邮件内容；若新建流程，确认新流程配置后再停用旧欢迎流程。

Mailchimp 官方目前将 Event API 自动化列为付费功能：Essentials 支持单步骤，Standard 及以上支持多步骤。**请先确认现有账号可以选择并启用这个触发器；不要仅因为接口能记录事件就认为会发邮件，也不要在未确认套餐时打开新版后台。** 这份代码不购买或更改套餐。[官方 Event API 说明](https://mailchimp.com/help/use-events-behavioral-targeting/)

## 3. 在 Vercel 保存服务器配置

在现有 Vercel 项目的 `Settings → Environment Variables` 中设置生产环境变量：

| 名称 | 值 |
| --- | --- |
| `MAILCHIMP_API_KEY` | 账号生成的私密 API key，只填在服务器环境变量中 |
| `MAILCHIMP_SERVER_PREFIX` | `us13` |
| `MAILCHIMP_LIST_ID` | `1a86cc1618` |
| `NEWSLETTER_ALLOWED_ORIGINS` | `https://themarginsjournals.com,https://www.themarginsjournals.com` |
| `NEWSLETTER_ENABLED` | 流程配置完毕后设为 `true`；此前保持 `false` |

密钥不要写进 HTML、GitHub 仓库或聊天。`.env.example` 只有配置名称与公开值。若要测试 Vercel 预览域名，仅把那个确切的预览来源加入对应预览环境配置，不使用任意来源通配符。环境变量改变后重新部署才会用于新版本。

`GET /api/newsletter` 返回 `ready: true` 只表示服务器配置格式已就绪，不验证账号权限、触发器是否启用或收信情况。

## 4. 实际接通验证

部署后，使用自己拥有的邮箱完成以下检查：

1. 新邮箱通过网站提交，网页显示已请求欢迎邮件；Mailchimp 联系人记录里应出现 `margins_welcome_requested` 事件，并有欢迎邮件发送记录，邮箱实际收到邮件。
2. 同一邮箱等上一轮流程完成至少五分钟后再次提交，应产生新的事件与欢迎邮件；不需要手动加入名单或流程。
3. 若测试退订后重订，通过 Mailchimp 表单完成重新确认，再回到原网页，让后台核对已恢复 `Subscribed` 后请求邮件。
4. 如果只有事件没有邮件，检查 Event API 名称、Audience、流程状态、发送步骤状态和五分钟重新进入间隔。若有发送记录但未收到，再核对该地址的投递记录与垃圾邮件文件夹。

邮件服务会排队发送，网站不能保证秒到。发送事件成功仅代表 Mailchimp 接受了请求，不代表 Gmail 已收信。

## 本地验证与实现范围

```bash
node --test test/*.test.cjs
node scripts/build.cjs
```

本地测试使用模拟 Mailchimp 响应，不提交任何真实邮箱，不发送邮件。覆盖新订阅、已订阅邮箱重复请求、退订与确认状态、并发双击、请求失败、未配置时的旧表单回退，以及确认后回到网页的处理。

前端不将邮箱写进浏览器存储。服务器使用 `status_if_new` 只设置新联系人的状态，避免覆盖已有退订；API key 只用于服务器请求。每个服务实例在内存中合并重复点击，跨实例的发送间隔由 Mailchimp 的五分钟重新进入规则控制，所以必须保留该规则。

静态输出 `dist` 包含各篇完整 HTML 页面、前端脚本、原有图片和站点地图。后台、测试和说明文件不复制到静态输出。原网页正文、图片、视频、白底样式与文章数据没有因本次订阅修改而变化。

实现依据：[Mailchimp Events API](https://mailchimp.com/developer/marketing/api/list-member-events/add-event/)、[重新订阅说明](https://mailchimp.com/help/resubscribe-a-contact/)、[Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js)。
