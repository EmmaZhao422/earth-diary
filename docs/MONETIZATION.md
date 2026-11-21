# Earth Diary 收入方案

> 标记说明：✓ = 已对照来源核对；⚠ = 未能完全核实或各方说法不一，动手前再确认。
> 核对日期：2026-11-21（ET）。

## 一句话结论

代码里三条收入线都已经接好，开关全在 `assets/js/config.js` 一个文件里。**现在网站上没有任何一条在赚钱**，因为每一条都差一个只有你本人能做的注册（要实名、收款和税务信息）。注册完把 ID 填进去就生效。

| 收入线 | 现在的状态 | 差什么 | 能不能今天就开始 |
| --- | --- | --- | --- |
| A. 展示广告（Google AdSense） | 广告位、同意横幅、ads.txt 模板都已就位，未加载任何广告代码 | 自有域名 + AdSense 账号审核通过 | 不能，要先有域名 |
| B. 联盟链接（住宿 / 玩乐 / 美食） | 每条回忆下方已有「想再去一次？」三个链接，目前是不带 ID 的普通链接 | 联盟账号 + 把带 ID 的链接模板贴进 config | 能 |
| C. 打赏 | 设置页和站内卡片已预留入口，未填地址时不显示 | 一个 Ko-fi（或同类）主页地址 | 能 |

## A. 展示广告：Google AdSense

**为什么选它**：面向普通用户的地图/日记类站点，AdSense 是门槛最低的主流展示广告网络；Mediavine、Ezoic、Media.net 等对流量或域名的要求更高。

**卡点是域名**：

- ✓ AdSense 帮助页写明，能添加为「站点」的只有三类：域名（如 website.com）、公共后缀列表上平台的子域名（官方举例 site.appspot.com）、AdSense 合作托管平台的站点（如 blogspot）。来源：[Site management is changing in AdSense](https://support.google.com/adsense/answer/12170421)
- ✓ 新站点要通过验证，证明你拥有该域名或能修改其内容。来源：[Manage your sites](https://support.google.com/adsense/answer/12169212)
- ⚠ `github.io` 能不能过，说法不一：有开发者报告 Vercel / Netlify / GitHub Pages 的免费子域名（没配自定义域名）都被拒（[dev.to 文章](https://dev.to/morinaga/why-google-adsense-will-not-approve-a-vercelapp-site-110b)，作者自己也说找不到官方明文）；另有回答指出 AdSense 检查的是根地址 `<user>.github.io`，而本项目在 `/earth-diary/` 子路径，根地址目前是 404（[StackOverflow 镜像](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/69243354/can-i-use-adsense-with-github-pages)）。
- **建议**：买一个域名。最稳，而且以后换托管也不丢流量。⚠ 价格以注册商页面为准；上面那篇 dev.to 文章提到 Cloudflare Registrar 的 .com 是 $9.15/年。

**你要做的（按顺序）**：

1. 买域名（例如 `earthdiary.xxx`，名字你定）。
2. 把域名告诉我，或者自己在仓库里跑一条命令：`python3 tools/set_domain.py 你的域名`。它会写好 `CNAME`，并把全站的 `emmazhao422.github.io/earth-diary` 换成新域名（canonical、sitemap、robots、分享图地址、404 页路径）。然后你在域名注册商那里加一条 DNS 记录（`www` 的 CNAME 指向 `emmazhao422.github.io`；⚠ 裸域名要按 GitHub 文档加 A 记录，以 GitHub Pages 设置页的提示为准）。
3. 用你的 Google 账号注册 AdSense，添加站点，等审核。⚠ 审核时长和是否通过由 Google 决定；纯工具类站点常见的拒绝理由是“内容不足”，所以站里已经放了 About / Guide / Privacy / Terms 四个内容页，上线后再补几篇真实的使用文章会更稳。
4. 审核通过后，在 AdSense 后台建 4 个广告单元，把 ID 填进 `config.js`：

```js
ads: {
  provider: 'adsense',
  adsense: {
    client: 'ca-pub-你的ID',
    slots: { sidebar: '…', feed: '…', detail: '…', pages: '…' }
  }
}
```

5. 把 `ads.txt` 里那一行的 `pub-0000000000000000` 换成你的 ID 并去掉行首的 `#`（AdSense 后台 Sites 页会给出准确的一行）。

**隐私合规**：

- 站内已有 cookie 同意横幅：只有配置了广告或 GA 时才出现；选「仅必要」则请求非个性化广告。
- ⚠ 面向欧盟 / 英国 / 瑞士用户投放时，Google 要求使用经其认证的同意管理平台（CMP）。最省事的做法是在 AdSense 后台的 Privacy & messaging 里开启 Google 自带的同意弹窗，然后在 config 里加 `consentBanner: false` 关掉站内横幅，避免弹两次。开通时以后台提示为准。
- `privacy.html` 已按 AdSense 的要求写了第三方 cookie 说明和退出链接。⚠ 这是我写的模板，不是法律意见，开广告前你过一遍。

**广告位在哪**（打开 `https://emmazhao422.github.io/earth-diary/?ads=preview` 可以看到每个位置的虚线框）：

| 位置 | config 里的名字 | 说明 |
| --- | --- | --- |
| 左侧面板底部，常驻 | `sidebar` | 仅桌面端、窗口够高时显示，约 300×250 |
| 时间线里每 6 条回忆后插一条 | `feed` | 桌面和手机都有；间隔由 `feedEvery` 控制 |
| 打开一条回忆后的最下方 | `detail` | 桌面和手机都有 |
| About / Guide 内容页中间 | `pages` | 没配置时不占位 |

没配置广告时，这些位置显示的是站内小卡片（备份提醒、使用提示、GitHub star），不加载任何第三方代码。

## B. 联盟链接：Travelpayouts（推荐先做这条）

**为什么选它**：一个账号能接多个旅行品牌，不用逐家申请；而且不要求自有域名，现在的 github.io 地址就能用。

- ✓ 注册免费；官方帮助页写明不需要拥有网站也能开始，注册时要建一个 Project（网站 / 博客 / App / 社媒主页）。
- ✓ 按成交付佣金。同一页给出的典型比例：机票约 1.1–1.5%，酒店约 4–5%，其他品类因项目而异；收入按月打到你选的收款方式。
- ✓ 加入具体品牌的项目可能需要审核，通常几天。
- 来源：[What is Travelpayouts](https://support.travelpayouts.com/hc/en-us/articles/203955593/)、[How to start working with affiliate programs](https://support.travelpayouts.com/hc/en-us/articles/360021216060)
- ⚠ 最低提现额和支持的收款方式，帮助页这一篇没写，注册后在后台看。

**你要做的**：

1. 注册 Travelpayouts，新建 Project，网址填 `https://emmazhao422.github.io/earth-diary/`。
2. 在品牌目录里申请住宿、当地玩乐、美食相关的项目（例如 Booking.com、GetYourGuide、Tripadvisor；⚠ 具体哪些品牌当前开放、条件如何，以后台目录为准）。
3. 每个项目在后台生成一条带你 ID 的深链，把里面的搜索词换成 `{q}`，贴进 `config.js` 的 `affiliate.links[].url`。可用占位符：`{q}` 地名、`{city}`、`{country}`、`{lat}`、`{lng}`。贴给我，我来替换也行。

**现状要说清楚**：现在三个链接指向 Booking / GetYourGuide / Tripadvisor 的普通搜索页，能用，但**不带任何联盟 ID，不产生佣金**。链接已标 `rel="sponsored"`，页面上有“可能产生佣金”的披露。

## C. 打赏：Ko-fi

- ✓ Ko-fi 免费档对一次性打赏的平台抽成是 0%（按月打赏、会员、店铺销售是 5%）；支付通道（PayPal / Stripe）手续费另算。来源：[Does Ko-fi take a fee?](https://help.ko-fi.com/hc/en-us/articles/360002506494-Does-Ko-fi-take-a-fee)
- 你注册后把主页地址填进 `config.js`：`support: { url: 'https://ko-fi.com/你的名字' }`，设置页和站内卡片会自动出现「请我喝杯奶茶」。

## 统计（申请广告时用得上）

`config.js` 的 `analytics` 留了两个口：GoatCounter（无 cookie，不需要同意横幅）和 GA4。两者都要你注册后填 ID，现在都是关的。

## 现实预期

- 这三条的收入都约等于「访问量 × 转化」。**新站没有流量，就没有收入**，不管广告位接得多好。我没有给收入数字，因为任何数字现在都是编的。
- 站里已经做了两件帮流量的事：护照卡片（一键生成可分享的图，带站点地址）和可被搜索引擎收录的内容页。
- 之后值得做、但需要你拍板的事：
  - 云同步（多设备共用一份日记）。这需要一个后端和账号体系，也是最自然的付费点；做之前要先定用哪家服务、要不要收费。
  - 提交到 Product Hunt、小红书、Reddit 的 r/travel 这类地方。发帖是以你的名义，得你来。

## 免费服务的边界

- 地图瓦片用 OpenFreeMap 公共实例：✓ 其服务条款写的是“完全免费、按现状提供”，没有可用性保证，可能变更或停止。来源：[OpenFreeMap ToS](https://openfreemap.org/tos/)。⚠ 条款没有单独提“商业用途”。
- 地点搜索用 Photon 公共接口：✓ 官方说明是可以用于自己的项目，但要合理使用，用量过大会被限流或封禁。来源：[komoot/photon](https://github.com/komoot/photon)。站内已做防抖和缓存。
- 流量起来以后，这两项都应该换成自托管或付费服务，入口在 `config.js` 的 `map` 段。
