import { test, expect, type Page, type Browser } from '@playwright/test';

async function loginAsManager(page: Page): Promise<void> {
  await page.goto('http://localhost:3001/auth/login');
  await page.locator('#email').fill('manager@flo.local');
  await page.locator('#password').fill('E2ePass123!');
  await page.locator('button[type="submit"]').click();
  await expect(page.getByTestId('pos-product-grid')).toBeVisible({ timeout: 20000 });
}

async function assertNoPageHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      docOk: doc.scrollWidth <= doc.clientWidth + 1,
      bodyOk: body.scrollWidth <= body.clientWidth + 1,
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      clientWidth: Math.min(doc.clientWidth, body.clientWidth),
    };
  });
  expect(
    overflow.docOk,
    `document horizontal overflow (${overflow.scrollWidth}>${overflow.clientWidth})`,
  ).toBe(true);
  expect(overflow.bodyOk, 'body horizontal overflow').toBe(true);
}

/**
 * Serial + single login: avoids auth rate-limit (10/15m) from N× manager logins.
 */
test.describe.serial('POS layout integrity', () => {
  let browser: Browser;
  let page: Page;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    page = await browser.newPage();
    await loginAsManager(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('POS product grid has no horizontal clipping and touchable product cards', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:3001/pos/');
    const productGrid = page.getByTestId('pos-product-grid');
    await expect(productGrid).toBeVisible();
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible();

    const grid = await productGrid.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(grid.scrollWidth, 'POS grid does not overflow horizontally').toBeLessThanOrEqual(
      grid.clientWidth,
    );

    const card = await page.getByTestId('pos-product-card').first().boundingBox();
    expect(card, 'product card has bounds').not.toBeNull();
    expect(card!.width, 'product card width').toBeGreaterThanOrEqual(44);
    expect(card!.height, 'product card height').toBeGreaterThanOrEqual(44);
  });

  test('POS at 1280px keeps cart + grid usable without page overflow', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:3001/pos/');

    const productGrid = page.getByTestId('pos-product-grid');
    const orderPanel = page.getByTestId('pos-order-panel');
    await expect(productGrid).toBeVisible();
    await expect(orderPanel).toBeVisible();
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible();

    await assertNoPageHorizontalOverflow(page);

    const gridBox = await productGrid.boundingBox();
    const cartBox = await orderPanel.boundingBox();
    expect(gridBox, 'product grid bounds').not.toBeNull();
    expect(cartBox, 'order panel bounds').not.toBeNull();

    // Fluid cart contract: ~280–380px (flo-pos-cart-min/max)
    expect(cartBox!.width, 'cart min width').toBeGreaterThanOrEqual(280);
    expect(cartBox!.width, 'cart max width').toBeLessThanOrEqual(380);

    // Product workspace must remain usable beside the cart
    expect(gridBox!.width, 'product grid usable width').toBeGreaterThanOrEqual(480);

    const card = await page.getByTestId('pos-product-card').first().boundingBox();
    expect(card, 'product card bounds').not.toBeNull();
    expect(card!.width, 'product card width at 1280').toBeGreaterThanOrEqual(44);
    expect(card!.height, 'product card height at 1280').toBeGreaterThanOrEqual(44);

    const gridOverflow = await productGrid.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(gridOverflow.scrollWidth, 'grid no internal horizontal overflow').toBeLessThanOrEqual(
      gridOverflow.clientWidth,
    );
  });

  for (const width of [1440, 1600] as const) {
    test(`POS at ${width}px keeps cart capped and page without horizontal overflow`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('http://localhost:3001/pos/');

      const productGrid = page.getByTestId('pos-product-grid');
      const orderPanel = page.getByTestId('pos-order-panel');
      await expect(productGrid).toBeVisible();
      await expect(orderPanel).toBeVisible();
      await assertNoPageHorizontalOverflow(page);

      const cartBox = await orderPanel.boundingBox();
      const gridBox = await productGrid.boundingBox();
      expect(cartBox).not.toBeNull();
      expect(gridBox).not.toBeNull();
      expect(cartBox!.width, 'cart within max').toBeLessThanOrEqual(380);
      expect(cartBox!.width, 'cart above min').toBeGreaterThanOrEqual(280);
      expect(gridBox!.width, 'grid still usable').toBeGreaterThanOrEqual(560);
    });
  }

  test('POS narrow viewport uses cart FAB and drawer without page overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:3001/pos/');

    const productGrid = page.getByTestId('pos-product-grid');
    await expect(productGrid).toBeVisible();
    await assertNoPageHorizontalOverflow(page);

    // Desktop cart aside is hidden below md; FAB opens drawer cart
    await expect(page.getByTestId('pos-order-panel')).toBeHidden();

    const fab = page.getByRole('button', { name: 'Open cart' });
    await expect(fab).toBeVisible();
    const fabBox = await fab.boundingBox();
    expect(fabBox, 'FAB bounds').not.toBeNull();
    expect(fabBox!.width, 'FAB width').toBeGreaterThanOrEqual(44);
    expect(fabBox!.height, 'FAB height').toBeGreaterThanOrEqual(44);

    await fab.click();
    const drawerCart = page.locator('[data-vaul-drawer]').getByTestId('pos-cart-panel');
    await expect(drawerCart).toBeVisible({ timeout: 5000 });
    await expect(drawerCart.getByText('Cart is empty')).toBeVisible();
    await expect(drawerCart.getByRole('button', { name: 'Place Order' })).toBeVisible();
    await assertNoPageHorizontalOverflow(page);

    const card = await page.getByTestId('pos-product-card').first().boundingBox();
    expect(card, 'narrow product card').not.toBeNull();
    expect(card!.width).toBeGreaterThanOrEqual(44);
    expect(card!.height).toBeGreaterThanOrEqual(44);
  });

  // --- V1-UI-P2-SHELL: representative non-POS pages ---

  for (const width of [1280, 1440, 1600] as const) {
    test(`AppShell products/orders/operations at ${width}px: no overflow + sidebar trigger`, async () => {
      await page.setViewportSize({ width, height: 900 });

      // Manager role cannot stay on /dashboard (redirects to /pos) — use operable hubs
      for (const route of ['/products/', '/orders/', '/operations/'] as const) {
        await page.goto(`http://localhost:3001${route}`);
        await expect(page).not.toHaveURL(/\/pos\/?$/);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
          timeout: 15000,
        });
        await assertNoPageHorizontalOverflow(page);

        const trigger = page.locator('[data-slot="sidebar-trigger"]');
        await expect(trigger).toBeVisible();
        const triggerBox = await trigger.boundingBox();
        expect(triggerBox, `${route} SidebarTrigger bounds`).not.toBeNull();
        expect(triggerBox!.width).toBeGreaterThanOrEqual(44);
        expect(triggerBox!.height).toBeGreaterThanOrEqual(44);

        // PageHeader owns the page h1; ContextHeader no longer emits h1
        const h1Count = await page.getByRole('heading', { level: 1 }).count();
        expect(h1Count, `${route} has page h1`).toBeGreaterThanOrEqual(1);
        expect(h1Count, `${route} not flooded with h1`).toBeLessThanOrEqual(2);
      }
    });
  }

  test('AppShell /pos and /kds remain full-bleed (no ContextHeader SidebarTrigger)', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto('http://localhost:3001/pos/');
    await expect(page.getByTestId('pos-product-grid')).toBeVisible();
    await expect(page.locator('[data-slot="sidebar-trigger"]')).toHaveCount(0);
    await assertNoPageHorizontalOverflow(page);

    await page.goto('http://localhost:3001/kds/');
    await expect(page.locator('[data-slot="sidebar-trigger"]')).toHaveCount(0);
    await assertNoPageHorizontalOverflow(page);
  });

  test('AppShell settings/reports/tables at 1280: no page overflow', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });

    for (const route of ['/settings/', '/reports/', '/tables/'] as const) {
      await page.goto(`http://localhost:3001${route}`);
      // Shell chrome present; tables may show EmptyState when module is off
      await expect(page.locator('[data-slot="sidebar-trigger"]')).toBeVisible({ timeout: 15000 });
      await assertNoPageHorizontalOverflow(page);
    }
  });
});
