# The Margins：文章源与新文章通知

欢迎邮件和重复订阅请求的部署说明请先看 `EMAIL-SETUP.md`。公开 Mailchimp 表单已经存在，新增后台尚待账号配置与部署；本次没有开启 RSS 自动邮件。

将 `feed.xml` 与网站一起部署，打开 `https://themarginsjournals.com/feed.xml` 应得到 XML，而不是首页 HTML。每次新增文章后，运行下述 Python 命令生成根目录的 `feed.xml`，将文章与更新后的 RSS 一起提交。网站构建由 `scripts/build.cjs` 完成。

在 Mailchimp 另行创建 RSS 自动邮件，读取这个文章源，选择有新文章才发送。首次启用前预览一次，避免误将已有文章作为新内容通知所有订阅者。发送频率与套餐资格以账号页面为准。[Mailchimp RSS 官方说明](https://mailchimp.com/help/share-your-blog-posts-with-mailchimp/)

## 发布和修改文章

文章分别保存在 `content/articles/文章-id.json`，每个文件包含一篇文章的 JSON 对象；站点配置位于 `content/site.json`。每篇需要独立、永久的 `id`，以及 `title`、`date` 和 `excerpt`；日期支持 `August 5, 2026` 或 `2026-08-05`。正文、图片说明和引用仍保存在各篇文章的 `content` 与 `citations` 中。

新文章使用新 `id` 和真实首次发布日期。修改已有文章时保留原 `id` 和 `date`，用 `updated` 记录修订日期。RSS 的 GUID 由 `id` 生成，正文、标题或修订日期变化不会产生一个新的 RSS 条目。邮件服务也应设为按新 GUID 判断新文章；是否发送重大修订需要另外配置，不能依赖改日期。

RSS 只包含 `content/articles/` 中的文章，不把 `content/pages/` 中的项目页或普通页面调整当成新文章。它保留原发布日期，按新到旧排列，摘要不包含图片或完整正文。未来日期的文章暂不进入 RSS；本工作流没有定时发布任务，到发布日期后需要再次运行生成命令并提交更新。重复 `id` 或无效日期会明确报错并阻止生成 RSS。

本地生成 RSS 只需 Python 3.9 或更新版本，无第三方依赖：

```bash
python3 scripts/build_feed.py
```

指定输入与输出位置：

```bash
python3 scripts/build_feed.py --input content --output _site/feed.xml
```

旧版单文件网站仍可作为输入：`python3 scripts/build_feed.py --input index.html`。此兼容方式只适用于仍包含 `script#mj-article-data` 的旧文件；当前网站以 `content/` 为内容来源。

部署成功后，打开 `/feed.xml` 应能看到三篇文章的标题和文章链接。链接使用 `/articles/文章-id/`，每个地址对应独立的 HTML 页面。现有条目的 GUID 仍然是 `urn:the-margins:article:文章-id`；迁移网址或修改标题不会生成新的条目身份。

## 独立文章页面与旧链接

构建会为每篇文章生成独立文档，正文直接包含在该页面的 HTML 中。点击文章通过普通链接加载对应页面，地址不再用 `#/reporting/...`。文章列表是 `/articles/`，项目列表是 `/projects/`；水项目和住房笔记分别是 `/projects/water/` 与 `/projects/housing/`。

旧的 `/#/reporting/文章-id` 分享链接保留浏览器端兼容跳转，打开后转到新的文章地址。RSS、导航与文章内链使用新地址。页面内定位仍可以使用 `#` 锚点，例如跳到订阅表单；它与旧的整站 hash 路由用途不同。
