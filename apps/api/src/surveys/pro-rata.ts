/**
 * แบ่ง total ตามสัดส่วน weights ให้ผลรวมเท่ากับ total พอดี (largest remainder method)
 * เศษที่เหลือให้คนที่มีเศษทศนิยมมากที่สุดก่อน ถ้าเท่ากันให้คนที่ลงก่อน (index น้อยกว่า)
 */
export function proRata(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const shares = exact.map(Math.floor);
  let left = total - shares.reduce((s, x) => s + x, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) shares[order[k].i]++;
  return shares;
}
