import { describe, it, expect } from 'vitest';
import { buildCsv, stampFileName } from '@/utils/export';

interface Row {
  name: string;
  note: string;
  count: number;
}

const COLS = [
  { title: '姓名', value: (r: Row) => r.name },
  { title: '备注', value: (r: Row) => r.note },
  { title: '数量', value: (r: Row) => r.count },
];

const csvOf = (rows: Row[]) => buildCsv(rows, COLS);

describe('buildCsv 基础形态', () => {
  it('首字符是 UTF-8 BOM（缺了 Excel 会把中文按 GBK 解析成乱码）', () => {
    const csv = csvOf([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('表头 + 数据行，CRLF 换行', () => {
    const csv = csvOf([{ name: '赵敏', note: '', count: 3 }]);
    expect(csv).toBe('\uFEFF姓名,备注,数量\r\n赵敏,,3\r\n');
  });

  it('空数组只输出表头', () => {
    expect(csvOf([])).toBe('\uFEFF姓名,备注,数量\r\n');
  });
});

describe('buildCsv 转义', () => {
  it('含逗号/引号/换行的字段加引号，内部引号翻倍', () => {
    const csv = csvOf([{ name: '张,三', note: '他说"好的"', count: 1 }]);
    expect(csv).toContain('"张,三"');
    expect(csv).toContain('"他说""好的"""');
  });

  it('含换行的字段原样保留在引号内（不破坏行结构）', () => {
    const csv = csvOf([{ name: '李四', note: '第一行\n第二行', count: 2 }]);
    expect(csv).toContain('"第一行\n第二行"');
  });

  it('首尾空格也会加引号（否则 Excel 会吃掉空格）', () => {
    expect(csvOf([{ name: ' 王五 ', note: '', count: 0 }])).toContain('" 王五 "');
  });

  it('null / undefined 导出为空单元格', () => {
    const csv = buildCsv(
      [{ a: null, b: undefined }],
      [
        { title: 'A', value: (r) => r.a },
        { title: 'B', value: (r) => r.b },
      ],
    );
    expect(csv).toBe('\uFEFFA,B\r\n,\r\n');
  });

  it('数字不加引号', () => {
    expect(csvOf([{ name: 'x', note: '', count: 42 }])).toContain('x,,42');
  });
});

describe('buildCsv 公式注入防护', () => {
  it('= + - @ 开头的字符串前置单引号（Excel 不执行公式）', () => {
    const csv = csvOf([
      { name: '=1+1', note: '+A1', count: 0 },
      { name: '-危险', note: '@SUM(A1)', count: 0 },
    ]);
    expect(csv).toContain(`'=1+1`);
    expect(csv).toContain(`'+A1`);
    expect(csv).toContain(`'-危险`);
    expect(csv).toContain(`'@SUM(A1)`);
  });

  it('负数（由数值列产出）不受影响', () => {
    const csv = buildCsv([{ n: -5 }], [{ title: 'n', value: (r) => r.n }]);
    expect(csv).toBe('\uFEFFn\r\n-5\r\n');
  });
});

describe('stampFileName', () => {
  it('附 8 位日期戳，避免多次导出互相覆盖', () => {
    expect(stampFileName('成员名单')).toMatch(/^成员名单-\d{8}\.csv$/);
  });

  it('可指定扩展名', () => {
    expect(stampFileName('x', 'txt')).toMatch(/^x-\d{8}\.txt$/);
  });
});
