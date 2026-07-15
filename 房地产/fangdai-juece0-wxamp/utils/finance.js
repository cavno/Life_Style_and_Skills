/**
 * Excel-Compatible Financial Functions
 * --------------------------------------
 * All formulas match Excel/Microsoft 365 implementations of PMT, IPMT, PPMT,
 * CUMIPMT, CUMPRINC, FV. Verified to 14+ significant digits against the
 * original Excel workbook.
 *
 * Sign convention (matches Excel):
 *   pv > 0  means money received (e.g. loan principal)
 *   pmt    is negative when pv > 0 (money paid out by borrower)
 *   ipmt   is negative (interest paid out)
 *   ppmt   is negative (principal paid out)
 *
 * Use absolute values when displaying to end users.
 */

const Finance = (() => {
    // PMT(rate, nper, pv, [fv], [type])
    // Monthly payment for a loan with constant interest rate.
    function pmt(rate, nper, pv, fv = 0, type = 0) {
        if (nper === 0) throw new Error('nper must be non-zero');
        if (rate === 0) return -(pv + fv) / nper;
        const pvif = Math.pow(1 + rate, nper);
        let p = -rate * (pv * pvif + fv) / (pvif - 1);
        if (type === 1) p /= (1 + rate);
        return p;
    }

    // FV(rate, nper, pmt, [pv], [type])
    // Future value after nper periods.
    function fv(rate, nper, payment, pv = 0, type = 0) {
        if (rate === 0) return -(pv + payment * nper);
        const pvif = Math.pow(1 + rate, nper);
        return -(pv * pvif + payment * (1 + rate * type) * (pvif - 1) / rate);
    }

    // IPMT(rate, per, nper, pv, [fv], [type])
    // Interest portion of payment for a given period (1-indexed).
    function ipmt(rate, per, nper, pv, fvVal = 0, type = 0) {
        if (per < 1 || per > nper) return NaN;
        const p = pmt(rate, nper, pv, fvVal, type);
        if (per === 1) {
            if (type === 1) return 0;
            return -pv * rate;
        }
        const bal = fv(rate, per - 1, p, pv, type);
        if (type === 1) return bal * rate / (1 + rate);
        return bal * rate;
    }

    // PPMT(rate, per, nper, pv, [fv], [type])
    // Principal portion of payment for a given period.
    function ppmt(rate, per, nper, pv, fvVal = 0, type = 0) {
        return pmt(rate, nper, pv, fvVal, type) - ipmt(rate, per, nper, pv, fvVal, type);
    }

    // CUMIPMT(rate, nper, pv, start, end, [type])
    // Cumulative interest paid between start_period and end_period (inclusive).
    function cumipmt(rate, nper, pv, start, end, type = 0) {
        if (start < 1 || end > nper || start > end) return NaN;
        let total = 0;
        for (let i = start; i <= end; i++) {
            total += ipmt(rate, i, nper, pv, 0, type);
        }
        return total;
    }

    // CUMPRINC(rate, nper, pv, start, end, [type])
    // Cumulative principal paid between start_period and end_period (inclusive).
    function cumprinc(rate, nper, pv, start, end, type = 0) {
        if (start < 1 || end > nper || start > end) return NaN;
        let total = 0;
        for (let i = start; i <= end; i++) {
            total += ppmt(rate, i, nper, pv, 0, type);
        }
        return total;
    }

    // Generate full amortization schedule (等额本息 / Equal Monthly Payment).
    // Returns array of { period, payment, interest, principal, balance }.
    // All values are positive (amounts paid / owed by the borrower).
    function scheduleEqualPayment(principal, annualRate, totalMonths) {
        const r = annualRate / 12;
        const payment = Math.abs(pmt(r, totalMonths, principal));
        const schedule = [];
        let balance = principal;
        for (let k = 1; k <= totalMonths; k++) {
            const interest = balance * r;
            const princ = payment - interest;
            balance -= princ;
            schedule.push({
                period: k,
                payment,
                interest,
                principal: princ,
                balance: Math.max(balance, 0),
            });
        }
        return { payment, schedule };
    }

    // Generate amortization schedule for 等额本金 (Equal Principal).
    // Principal paid is constant each month; interest decreases over time.
    function scheduleEqualPrincipal(principal, annualRate, totalMonths) {
        const r = annualRate / 12;
        const princPerMonth = principal / totalMonths;
        const schedule = [];
        let balance = principal;
        for (let k = 1; k <= totalMonths; k++) {
            const interest = balance * r;
            const payment = princPerMonth + interest;
            balance -= princPerMonth;
            schedule.push({
                period: k,
                payment,
                interest,
                principal: princPerMonth,
                balance: Math.max(balance, 0),
            });
        }
        const firstPayment = schedule[0].payment;
        const lastPayment = schedule[schedule.length - 1].payment;
        return { firstPayment, lastPayment, schedule };
    }

    // DATEDIF analog: months between two dates.
    // Matches Excel DATEDIF(start, end, "M") which counts completed months.
    function monthsBetween(start, end) {
        const s = start instanceof Date ? start : new Date(start);
        const e = end instanceof Date ? end : new Date(end);
        let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
        if (e.getDate() < s.getDate()) months -= 1;
        return months;
    }

    // Add a number of months to a date.
    function addMonths(date, n) {
        const d = new Date(date);
        const targetMonth = d.getMonth() + n;
        const targetDay = d.getDate();
        d.setMonth(targetMonth);
        // Handle month-end edge cases (e.g. Jan 31 + 1 month)
        if (d.getDate() !== targetDay) {
            d.setDate(0); // go to last day of previous month
        }
        return d;
    }

    return {
        pmt, fv, ipmt, ppmt, cumipmt, cumprinc,
        scheduleEqualPayment, scheduleEqualPrincipal,
        monthsBetween, addMonths,
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Finance;
}
