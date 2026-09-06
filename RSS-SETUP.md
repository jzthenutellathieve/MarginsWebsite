# The Margins：文章源与新文章通知

欢迎邮件和重复订阅请求的部署说明请先看 `EMAIL-SETUP.md`。公开 Mailchimp 表单已经存在，新增后台尚待账号配置与部署；本次没有开启 RSS 自动邮件。

将 `feed.xml` 与网站一起部署，打开 `https://themarginsjournals.com/feed.xml` 应得到 XML，而不是首页 HTML。Vercel 版本由 `scripts/build.cjs` 复制已有的文章源；每次新增文章后先运行下述 Python 命令更新源文件，再提交部署。

在 Mailchimp 另行创建 RSS 自动邮件，读取这个文章源，选择有新文章才发送。首次启用前预览一次，避免误将已有文章作为新内容通知所有订阅者。发送频率与套餐资格以账号页面为准。[Mailchimp RSS 官方说明](https://mailchimp.com/help/share-your-blog-posts-with-mailchimp/)

## 发布和修改文章

文章源读取 `index.html` 中 `script#mj-article-data` 的文章数组。每篇需要独立、永久的 `id`，以及 `title`、`date` 和 `excerpt`；日期支持 `August 5, 2026` 或 `2026-08-05`。

新文章使用新 `id` 和真实首次发布日期。修改已有文章时保留原 `id` 和 `date`，用 `updated` 记录修订日期。RSS 的 GUID 由 `id` 生成，正文、标题或修订日期变化不会产生一个新的 RSS 条目。邮件服务也应设为按新 GUID 判断新文章；是否发送重大修订需要另外配置，不能依赖改日期。

RSS 只包含文章数组中的文章，不把 Solutions 项目页或普通页面调整当成新文章。它保留原发布日期，按新到旧排列，摘要不包含图片或完整正文。未来日期的文章暂不进入 RSS；本工作流没有定时发布任务，到发布日期后需要再次提交或手动运行才能进入文章源。重复 `id` 或无效日期会明确报错并阻止部署。

本地生成 RSS 只需 Python 3.9 或更新版本，无第三方依赖：

```bash
python3 scripts/build_feed.py
```

指定输入与输出位置：

```bash
python3 scripts/build_feed.py --input index.html --output _site/feed.xml
```

部署成功后，打开 `/feed.xml` 应能看到三篇文章的标题和文章链接。链接使用 `/#/reporting/文章-id`，点击后在网站内直接打开对应文章。修改标题不会改变这些文章 ID，因此不会产生一份新的订阅条目。

## 为什么点文章时没有整页加载

网站目前是单个 HTML 加 JavaScript 的单页结构。首页首次加载时，文章数据也已下载；点击文章后，脚本切换显示内容并更新地址中的 `#/reporting/...`。后退、前进和直接打开文章链接仍可使用，无须人为增加等待。

传统多页网站通常为每篇文章提供一个独立地址，进入时请求相应文档；有些网站也会预加载内容，因此仅凭是否闪现加载状态无法判断技术或制作方式。参见 [MDN 对单页网站的说明](https://developer.mozilla.org/en-US/docs/Glossary/SPA)。

对需要长期积累文章的刊物，每篇文章拥有独立页面会更便于单独配置搜索信息和分享预览。目前 hash 路由在这方面有局限。[Google 建议为不同内容提供可抓取的独立 URL](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)。本轮保留现有架构和旧链接，未迁移为多页网站，也未人为增加加载动画。
