import fs from 'node:fs';
import { test, expect } from './fixtures';
import { resetStub, loginAs, gotoModule, btn } from './helpers';

/**
 * Phase 1 A2 数据导出（CSV + UTF-8 BOM，零依赖）。
 *
 * 断言落点：① 真的发生下载且文件名带日期戳；② 首字节是 BOM（否则 Excel 中文乱码）；
 * ③ 导出范围 = 屏幕上那份（权限过滤 / 当前筛选都生效）。
 */
const ZHAOMIN = { name: '赵敏', studentId: 'XUAN2026', password: 'e2ePass123' };
const WANG = { name: '王开发', studentId: 'DEV0001', password: 'e2ePass123' };   // developer：可见数据看板

test.describe('数据导出', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('成员名单导出：BOM 头正常，且只含本部门成员', async ({ page }) => {
    await loginAs(page, ZHAOMIN);
    await gotoModule(page, '权限管理');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      btn(page, '导出名单').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^成员名单-\d{8}\.csv$/);

    const filePath = await download.path();
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain('姓名,学号/工号,部门,角色,加入时间');
    // dept_head 只看得见本部门：宣传部两人在，其他部门的人不在
    expect(content).toContain('赵敏');
    expect(content).toContain('孙晓雨');
    expect(content).not.toContain('陈主席');
  });

  test('任务清单导出：跟随当前状态筛选', async ({ page }) => {
    await loginAs(page, ZHAOMIN);
    await gotoModule(page, '任务管理');

    // 切到「待开始」再导出——导出内容必须与屏幕一致
    await page.getByRole('tab', { name: /待\s*开\s*始/ }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      btn(page, '导出').click(),
    ]);

    const content = fs.readFileSync((await download.path())!, 'utf8');
    expect(content).toContain('任务标题,状态,优先级,执行部门');
    expect(content).toContain('招新宣传推文终稿校对与排版');
    // 该任务是 in_progress，被「待开始」筛掉
    expect(content).not.toContain('秋季迎新晚会舞台布置与物资搬运协调');
  });

  test('数据看板汇总导出：长表三列（分类/项目/数值）', async ({ page }) => {
    await loginAs(page, WANG);            // developer 角色可见「数据看板」Tab
    await gotoModule(page, '权限管理');
    await page.getByRole('tab', { name: /数\s*据\s*看\s*板/ }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      btn(page, '导出汇总').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^数据看板汇总-\d{8}\.csv$/);
    const content = fs.readFileSync((await download.path())!, 'utf8');
    expect(content).toContain('分类,项目,数值');
    expect(content).toContain('汇总,总事件数,');
  });
});
