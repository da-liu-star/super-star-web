import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5173'
const screenshotDir =
  process.env.SCREENSHOT_DIR
  || 'C:/Users/HP/.codex/visualizations/2026/11/14/01a1da5c-314c-7e12-bf28-e6d222bba791/super-star-web-screenshots'
const chromePath =
  process.env.CHROME_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const testUsername =
  process.env.TEST_USERNAME || `hoshino_${Date.now().toString().slice(-8)}`

await mkdir(screenshotDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath,
})

const results = []
const pageErrors = []

try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
  })
  const desktopPage = await desktop.newPage()
  observeErrors(desktopPage, pageErrors)

  await desktopPage.goto(`${baseUrl}/auth`, { waitUntil: 'networkidle' })
  await desktopPage.locator('#username').waitFor()
  await assertRemovedAuthCopy(desktopPage)
  await assertNoHorizontalOverflow(desktopPage, 'desktop auth')
  await assertHealingAuthStyles(desktopPage)
  await assertCharacterInteractions(desktopPage)
  await desktopPage.screenshot({
    path: `${screenshotDir}/desktop-auth.png`,
    fullPage: true,
  })
  results.push('desktop auth rendered')

  await desktopPage.getByRole('tab', { name: '注册' }).click()
  await desktopPage.locator('#nickname').waitFor()
  await desktopPage.locator('#nickname').fill('星野')
  await desktopPage.locator('#email').fill(`${testUsername}@example.com`)
  await desktopPage.locator('#username').fill(testUsername)
  await desktopPage.locator('#password').fill('123456')
  await desktopPage.locator('#confirm-password').fill('123456')
  await desktopPage.locator('.agreement-row input').check({ force: true })
  await desktopPage.getByRole('button', { name: '创建账号并进入' }).click()
  await desktopPage.waitForURL('**/home')
  await desktopPage.getByRole('heading', { name: '工作台' }).waitFor()
  await assertNoHorizontalOverflow(desktopPage, 'desktop home')
  await desktopPage.waitForTimeout(300)
  await desktopPage.screenshot({
    path: `${screenshotDir}/desktop-home.png`,
    fullPage: true,
  })
  results.push('registration created account and redirected to home')

  await desktopPage.reload({ waitUntil: 'networkidle' })
  await desktopPage.getByRole('heading', { name: '工作台' }).waitFor()
  results.push('session survived a page refresh')

  await desktopPage.getByRole('button', { name: '退出登录' }).click()
  await desktopPage.waitForURL('**/auth')
  await desktopPage.locator('#username').fill('admin')
  await desktopPage.locator('#password').fill('wrong-password')
  await desktopPage.getByRole('button', { name: '进入工作台' }).click()
  await desktopPage.getByRole('alert').filter({ hasText: '用户名或密码不正确' }).waitFor()
  await desktopPage.locator('.characters.characters--error').waitFor()
  results.push('invalid credentials were rejected')

  await desktopPage.locator('#username').fill('admin')
  await desktopPage.locator('#password').fill('123456')
  await desktopPage.getByRole('button', { name: '进入工作台' }).click()
  await desktopPage.waitForURL('**/home')
  await desktopPage.getByRole('heading', { name: '工作台' }).waitFor()
  results.push('demo login redirected to home')

  await desktopPage.getByRole('button', { name: /图片编辑/ }).click()
  await desktopPage.waitForURL('**/editor')
  await desktopPage.getByRole('heading', { name: '拼接预览' }).waitFor()
  const imagePath = `${screenshotDir}/desktop-auth.png`
  await desktopPage.locator('input[type="file"]').setInputFiles([imagePath, imagePath])
  await desktopPage.locator('.stitch-preview img').waitFor()
  await assertNoHorizontalOverflow(desktopPage, 'desktop image editor')

  await desktopPage.locator('#stitch-size-mode').selectOption('width')
  await desktopPage.locator('#fixed-width').fill('600')
  await desktopPage.locator('#fixed-width').press('Tab')
  await desktopPage.waitForFunction(() => {
    const image = document.querySelector('.stitch-preview img')
    return image?.naturalWidth === 1200
  })
  await assertEditorFitsViewport(desktopPage)

  await desktopPage.locator('#stitch-orientation').selectOption('vertical')
  await desktopPage.locator('#stitch-size-mode').selectOption('height')
  await desktopPage.locator('#fixed-height').fill('400')
  await desktopPage.locator('#fixed-height').press('Tab')
  await desktopPage.waitForFunction(() => {
    const image = document.querySelector('.stitch-preview img')
    return image?.naturalHeight === 800
  })

  await dispatchClipboardImage(desktopPage)
  await desktopPage.waitForFunction(() => {
    return document.querySelectorAll('.image-row').length === 3
  })
  await desktopPage.getByText('已从剪贴板导入 1 张图片').waitFor()

  const stitchDownloadPromise = desktopPage.waitForEvent('download')
  await desktopPage.getByRole('button', { name: '导出拼接图' }).click()
  const stitchDownload = await stitchDownloadPromise
  if (!/\.(png|jpe?g|webp)$/i.test(stitchDownload.suggestedFilename())) {
    throw new Error('Stitched image download has an invalid filename')
  }

  await desktopPage.getByRole('tab', { name: '裁剪旋转' }).click()
  await dispatchClipboardImage(desktopPage)
  await desktopPage.locator('.crop-canvas').waitFor()
  await desktopPage.locator('input[type="file"]').setInputFiles(imagePath)
  await desktopPage.locator('.crop-canvas').waitFor()
  await desktopPage.getByRole('button', { name: '右转' }).click()
  const cropHandle = await desktopPage.locator('.crop-handle--se').boundingBox()
  if (!cropHandle) {
    throw new Error('Crop resize handle is missing')
  }
  await desktopPage.mouse.move(
    cropHandle.x + cropHandle.width / 2,
    cropHandle.y + cropHandle.height / 2,
  )
  await desktopPage.mouse.down()
  await desktopPage.mouse.move(cropHandle.x - 90, cropHandle.y - 70)
  await desktopPage.mouse.up()
  await desktopPage.getByRole('button', { name: '应用裁剪' }).click()
  await desktopPage.getByText('裁剪已应用').waitFor()
  await desktopPage.screenshot({
    path: `${screenshotDir}/desktop-editor.png`,
    fullPage: true,
  })

  const cropDownloadPromise = desktopPage.waitForEvent('download')
  await desktopPage.getByRole('button', { name: '导出', exact: true }).click()
  const cropDownload = await cropDownloadPromise
  if (!/\.(png|jpe?g|webp)$/i.test(cropDownload.suggestedFilename())) {
    throw new Error('Cropped image download has an invalid filename')
  }
  results.push('fixed-length stitching, clipboard paste, crop, rotation and export completed')

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
  })
  const mobilePage = await mobile.newPage()
  observeErrors(mobilePage, pageErrors)

  await mobilePage.goto(`${baseUrl}/auth`, { waitUntil: 'networkidle' })
  await mobilePage.locator('#username').waitFor()
  await assertRemovedAuthCopy(mobilePage)
  await assertNoHorizontalOverflow(mobilePage, 'mobile auth')
  await assertHealingAuthStyles(mobilePage)
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-auth.png`,
    fullPage: true,
  })
  await mobilePage.locator('#username').fill('admin')
  await mobilePage.locator('#password').fill('123456')
  await mobilePage.getByRole('button', { name: '进入工作台' }).click()
  await mobilePage.waitForURL('**/home')
  await mobilePage.getByRole('heading', { name: '工作台' }).waitFor()
  await assertNoHorizontalOverflow(mobilePage, 'mobile home')
  await mobilePage.getByRole('button', { name: /图片编辑/ }).click()
  await mobilePage.waitForURL('**/editor')
  await mobilePage.getByRole('heading', { name: '拼接预览' }).waitFor()
  await assertNoHorizontalOverflow(mobilePage, 'mobile image editor')
  await mobilePage.waitForTimeout(300)
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-editor.png`,
    fullPage: true,
  })
  await mobilePage.getByRole('button', { name: '返回工作台' }).click()
  await mobilePage.waitForURL('**/home')
  await mobilePage.waitForTimeout(300)
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-home.png`,
    fullPage: true,
  })
  results.push('mobile auth, home, and editor layouts rendered without horizontal overflow')

  await desktop.close()
  await mobile.close()
} finally {
  await browser.close()
}

if (pageErrors.length > 0) {
  throw new Error(`Browser errors:\n${pageErrors.join('\n')}`)
}

console.log(JSON.stringify({ results, screenshotDir }, null, 2))

function observeErrors(page, target) {
  page.on('pageerror', (error) => target.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text()
      if (!/Failed to load resource.*(400|401)/.test(text)) {
        target.push(`console: ${text}`)
      }
    }
  })
}

async function assertNoHorizontalOverflow(page, label) {
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }))
  if (
    layout.documentWidth > layout.viewport + 1
    || layout.bodyWidth > layout.viewport + 1
  ) {
    throw new Error(
      `${label} has horizontal overflow: ${JSON.stringify(layout)}`,
    )
  }
}

async function assertEditorFitsViewport(page) {
  const layout = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight,
  }))
  if (layout.documentHeight > layout.viewportHeight + 1) {
    throw new Error(
      `Desktop image editor exceeds one viewport: ${JSON.stringify(layout)}`,
    )
  }
}

async function assertHealingAuthStyles(page) {
  await page.locator('#username').focus()
  await page.waitForTimeout(240)

  const styles = await page.evaluate(() => {
    const inputShell = document.querySelector('.input-shell')
    const button = document.querySelector('.submit-button')
    const page = document.querySelector('.auth-page')
    const form = document.querySelector('.form-container')

    if (!inputShell || !button || !page || !form) {
      throw new Error('Login page style elements are missing')
    }

    return {
      inputShadow: getComputedStyle(inputShell).boxShadow,
      buttonRadius: Number.parseFloat(getComputedStyle(button).borderRadius),
      pageBackground: getComputedStyle(page).backgroundImage,
      hasSeparateCard: Boolean(document.querySelector('.auth-card')),
      formHeight: form.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }
  })

  if (styles.inputShadow === 'none') {
    throw new Error('Focused input does not show a soft accent shadow')
  }
  if (styles.buttonRadius < 24) {
    throw new Error(`Login button is not capsule shaped: ${styles.buttonRadius}px`)
  }
  if (/url\(/i.test(styles.pageBackground)) {
    throw new Error('Login background unexpectedly contains an image')
  }
  if (styles.hasSeparateCard) {
    throw new Error('Login form still renders inside a separate card layer')
  }
  if (styles.formHeight > styles.viewportHeight - 20) {
    throw new Error(
      `Login form exceeds one viewport: ${styles.formHeight}px / ${styles.viewportHeight}px`,
    )
  }
}

async function assertRemovedAuthCopy(page) {
  const forbidden = [
    '安全访问',
    '欢迎回来',
    '填入演示账号',
    '登录会话仅用于身份验证',
  ]
  const text = await page.locator('body').innerText()
  const found = forbidden.find((item) => text.includes(item))
  if (found) {
    throw new Error(`Removed login copy is still visible: ${found}`)
  }
}

async function assertCharacterInteractions(page) {
  await page.locator('#username').focus()
  await page.locator('.characters.characters--typing').waitFor()

  await page.locator('#password').focus()
  await page.locator('.characters.characters--password').waitFor()

  await page.locator('.password-toggle').first().click()
  await page.locator('.characters.characters--peek').waitFor()

  await page.mouse.move(100, 400)
  await page.waitForTimeout(120)
  const eyeOffset = await page.locator('.characters').evaluate((element) => {
    return getComputedStyle(element).getPropertyValue('--eye-x').trim()
  })
  if (!eyeOffset || Number.parseFloat(eyeOffset) === 0) {
    throw new Error('Animated characters did not react to pointer movement')
  }
}

async function dispatchClipboardImage(page) {
  await page.evaluate(() => {
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0))
    const file = new File([bytes], 'pasted.png', { type: 'image/png' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    window.dispatchEvent(event)
  })
}
