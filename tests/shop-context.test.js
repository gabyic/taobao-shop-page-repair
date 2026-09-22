const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  classifyShopContext,
  isCandidateCategoryLocation,
  isCandidateHomeLocation,
} = require("../shop-context.js");

function createDocument({ selectors = {}, title = "" } = {}) {
  return {
    title,
    querySelector(selector) {
      return selectors[selector]?.[0] || null;
    },
    querySelectorAll(selector) {
      return selectors[selector] || [];
    },
  };
}

test("数字淘宝和极有家域名无需 DOM 信号即可确认", () => {
  for (const hostname of [
    "shop203317430.taobao.com",
    "jiyoujia492511957.jiyoujia.com",
  ]) {
    const result = classifyShopContext(
      { hostname, pathname: "/category.htm" },
      createDocument()
    );
    assert.equal(result.supported, true);
    assert.equal(result.hostType, "numeric");
    assert.equal(result.reason, "numeric-shop-host");
  }
});

test("自定义淘宝和极有家域名必须通过店铺结构识别", () => {
  const shopDocument = createDocument({
    title: "首页-有点艺术灯具馆-淘宝网",
    selectors: {
      '[class*="tshop-"]': [{}],
      'a[href*="/category.htm"]': [{}, {}],
      'a[href*="item.taobao.com/item.htm"]': [{}, {}, {}, {}],
    },
  });

  for (const hostname of [
    "ikfs0orn453wy1jhzjt0c5bydawewrm.taobao.com",
    "custom-showroom.jiyoujia.com",
  ]) {
    const result = classifyShopContext(
      { hostname, pathname: "/category.htm" },
      shopDocument
    );
    assert.equal(result.supported, true);
    assert.equal(result.hostType, "custom");
    assert.ok(result.score >= result.requiredScore);
    assert.ok(result.signals.includes("legacy-shop-structure"));
  }
});

test("随机平台子域名没有足够店铺信号时拒绝", () => {
  const result = classifyShopContext(
    {
      hostname: "random-subdomain.taobao.com",
      pathname: "/category.htm",
    },
    createDocument({ title: "淘宝网" })
  );

  assert.equal(result.supported, false);
  assert.equal(result.reason, "shop-signals-not-found");
});

test("普通淘宝页面即使伪造部分信号也明确拒绝", () => {
  const partialSignals = createDocument({
    title: "测试店铺-淘宝网",
    selectors: {
      '[class*="tshop-"]': [{}],
      'a[href*="/category.htm"]': [{}, {}],
      'a[href*="item.taobao.com/item.htm"]': [{}, {}, {}],
    },
  });

  for (const hostname of [
    "www.taobao.com",
    "item.taobao.com",
    "s.taobao.com",
  ]) {
    const result = classifyShopContext(
      { hostname, pathname: "/category.htm" },
      partialSignals
    );
    assert.equal(result.supported, false);
    assert.equal(result.reason, "excluded-platform-host");
  }
});

test("首页路径精确排除，店铺内其余页面均为修复候选", () => {
  assert.equal(
    isCandidateHomeLocation({ hostname: "custom.taobao.com", pathname: "/" }),
    true
  );
  assert.equal(
    isCandidateHomeLocation({ hostname: "custom.jiyoujia.com", pathname: "/index.htm" }),
    true
  );
  assert.equal(
    isCandidateHomeLocation({
      hostname: "jiyoujia492511957.jiyoujia.com",
      pathname: "/shop/view_shop.htm",
    }),
    true
  );
  assert.equal(
    isCandidateHomeLocation({ hostname: "item.taobao.com", pathname: "/" }),
    false
  );

  // 首页路径本身不是候选（由 redirect-home.js 单独处理并跳转）。
  for (const pathname of ["/", "/index.htm", "/shop/view_shop.htm"]) {
    assert.equal(
      isCandidateCategoryLocation({
        hostname: "jiyoujia492511957.jiyoujia.com",
        pathname,
      }),
      false
    );
  }

  // 分类页、带分类编号的分类页、搜索/筛选页、商品详情页，以及任何
  // 未来可能出现的未知路径格式，只要不是首页都作为候选，是否真正
  // 修复交给 classifyShopContext 的结构信号确认。
  for (const pathname of [
    "/category.htm",
    "/category-1782983743.htm",
    "/category-abc.htm",
    "/search.htm",
    "/item.htm",
    "/promotion-2024.htm",
  ]) {
    assert.equal(
      isCandidateCategoryLocation({ hostname: "custom.taobao.com", pathname }),
      true
    );
  }

  assert.equal(
    isCandidateCategoryLocation({
      hostname: "item.taobao.com",
      pathname: "/category.htm",
    }),
    false
  );
});

test("跳转、修复、诊断和面板不再各自维护数字域名正则", () => {
  for (const file of [
    "redirect-home.js",
    "repair-category.js",
    "diagnostics-page.js",
    "popup.js",
  ]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.match(source, /ShopCategoryContext|shop-context\.js/);
    assert.doesNotMatch(source, /shop\\d\+|jiyoujia\\d\+/);
  }
});
