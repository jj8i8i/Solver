onmessage = function(e) {
    try {
        const { numbers, target, level } = e.data;
        const solver = new Solver(numbers, target, level);
        const result = solver.solve();
        postMessage(result);
    } catch (error) {
        console.error("Critical Error in Solver Worker:", error);
        postMessage({ solutions: [], closest: { value: Infinity } });
    }
};

class Solver {
    constructor(numbers, target, level) {
        this.initialNumbers = numbers;
        this.target = target;
        this.level = level;
        this.solutions = [];
        this.closest = { value: Infinity, str: '', complexity: Infinity, derivation: null };
        this.memo = new Map();
        this.TIMEOUT_MS = 15000;
        this.startTime = 0;
        this.PRUNING_THRESHOLD = Math.max(target * 10, 5000); 
    }

    solve() {
        this.startTime = Date.now();
        const initialItems = this.initialNumbers.map(n => ({ value: n, str: n.toString(), complexity: 0, derivation: null }));
        try {
            this.find(initialItems);
        } catch (e) {
            if (e.message === 'SolverTimeout') console.log('Solver timed out.');
            else throw e;
        }
        this.solutions.sort((a, b) => a.complexity - b.complexity);
        return { solutions: this.solutions, closest: this.closest };
    }
    
    find(items) {
        if (Date.now() - this.startTime > this.TIMEOUT_MS) throw new Error('SolverTimeout');
        const key = items.map(it => this.formatNumber(it.value)).sort().join('|');
        if (this.memo.has(key)) return;

        if (items.length < this.initialNumbers.length && items.some(item => item.value > this.PRUNING_THRESHOLD && item.value > this.target)) return;
        
        if (items.length === 1) {
            const item = items[0];
            if (Math.abs(item.value - this.target) < 0.0001) this.solutions.push(item);
            else if (item.value % 1 === 0) {
                if (Math.abs(item.value - this.target) < Math.abs(this.closest.value - this.target)) this.closest = item;
                else if (Math.abs(item.value - this.target) === Math.abs(this.closest.value - this.target) && item.complexity < this.closest.complexity) this.closest = item;
            }
            return;
        }

        this.runUnaryOps(items);
        if (this.level >= 3) this.runSigmaOps(items);
        this.runBinaryOps(items);
        this.memo.set(key, true);
    }
    
    runUnaryOps(items) {
        if (this.level >= 2) {
             for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.value > 0) {
                    const remaining = items.filter((_, idx) => idx !== i);
                    const sqrtVal = Math.sqrt(item.value);
                    this.find([...remaining, { value: sqrtVal, str: `\\sqrt{${item.str}}`, complexity: item.complexity + 5, derivation: { op: '√', inputs: [item], resultStr: `${this.formatNumber(sqrtVal)}` } }]);
                    if (sqrtVal > 0) {
                        const dblSqrtVal = Math.sqrt(sqrtVal);
                        this.find([...remaining, { value: dblSqrtVal, str: `\\sqrt{\\sqrt{${item.str}}}`, complexity: item.complexity + 6, derivation: { op: '√√', inputs: [item], resultStr: `${this.formatNumber(dblSqrtVal)}` } }]);
                    }
                }
            }
        }
        if (this.level >= 3) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.value >= 0 && item.value <= 10 && item.value % 1 === 0) {
                     const remaining = items.filter((_, idx) => idx !== i);
                     const factVal = this.factorial(item.value);
                     this.find([...remaining, { value: factVal, str: `(${item.str})!`, complexity: item.complexity + 8, derivation: { op: '!', inputs: [item], resultStr: `${this.formatNumber(factVal)}` } }]);
                }
            }
        }
    }

    runBinaryOps(items) {
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
                let a = items[i], b = items[j];
                // Canonical ordering for commutative operators
                if (a.str > b.str) [a, b] = [b, a];
                const remaining = items.filter((item, idx) => idx !== i && idx !== j);
                this.tryOp(a, b, '+', remaining);
                this.tryOp(a, b, '*', remaining);
                // Non-commutative operators
                this.tryOp(items[i], items[j], '-', remaining); this.tryOp(items[j], items[i], '-', remaining);
                this.tryOp(items[i], items[j], '/', remaining); this.tryOp(items[j], items[i], '/', remaining);
                if (this.level >= 1) { this.tryOp(items[i], items[j], '^', remaining); this.tryOp(items[j], items[i], '^', remaining); }
                if (this.level >= 2) { this.tryOp(items[i], items[j], 'root', remaining); this.tryOp(items[j], items[i], 'root', remaining); }
            }
        }
    }
    
    runSigmaOps(items) { /* ... same as previous ... */ }
    processSigma(startSet, endSet, remaining) { /* ... same as previous ... */ }
    getBoundaryValues(items) { /* ... same as previous ... */ }

    tryOp(a, b, op, remaining) {
        let value, str, complexity, inputs = [a,b];
        if ((op === '*' || op === '/') && b.value === 1) return;
        if (op === '^' && b.value === 1) return;
        if (op === '*' && a.value === 1) return; // Already handled by commutative sort

        switch (op) {
            case '+': value = a.value + b.value; str = `(${a.str}+${b.str})`; complexity = a.complexity + b.complexity + 1; break;
            case '-':
                if (a.value < b.value) return; value = a.value - b.value; str = `(${a.str}-${b.str})`; complexity = a.complexity + b.complexity + 1.1; break;
            case '*': value = a.value * b.value; str = `${this.addParen(a, '*')}*${this.addParen(b, '*')}`; complexity = a.complexity + b.complexity + 1.2; break;
            case '/':
                if (b.value === 0) return; value = a.value / b.value; str = `\\frac{${a.str}}{${b.str}}`; complexity = a.complexity + b.complexity + 1.5; break;
            case '^': if (Math.abs(b.value) > 10 || Math.abs(a.value) > 20) return; value = Math.pow(a.value, b.value); str = `{${this.addParen(a, '^')}}^{${b.str}}`; complexity = a.complexity + b.complexity + 4; break;
            case 'root': if (b.value <= 1 || b.value > 10 || a.value < 0) return; value = Math.pow(a.value, 1/b.value); str = `\\sqrt[${b.str}]{${a.str}}`; complexity = a.complexity + b.complexity + 5; break;
            default: return;
        }
        if (!isFinite(value)) return;
        if (value % 1 !== 0 && remaining.every(item => item.value % 1 === 0) && this.level < 2) return;
        
        const derivation = { op, inputs, resultStr: this.formatNumber(value) };
        this.find([...remaining, { value, str, complexity, derivation }]);
    }
    
    factorial = (n) => (n <= 1 ? 1 : n * this.factorial(n - 1));
    formatNumber = (n) => parseFloat(n.toFixed(3).replace(/\.?0+$/, ""));
    addParen = (item, op) => {
        if (!item.derivation) return item.str;
        const opMap = {'+':0, '-':0, '*':1, '/':1, '^':2, 'root':2 };
        const currentOpPrec = opMap[op];
        const itemOpPrec = opMap[item.derivation.op] ?? 3;
        if (itemOpPrec < currentOpPrec) return `(${item.str})`;
        return item.str;
    };
    calculateSigma(start, end, pattern, k = null) {
        let sum = 0;
        for (let i = start; i <= end; i++) {
            let term;
            switch(pattern) {
                case 'i': term = i; break; case 'i+i': term = i + i; break; case 'i*i': term = i * i; break;
                case 'i!': if (i > 10) return null; term = this.factorial(i); break;
                case 'sqrt(i)': if (i < 0) return null; term = Math.sqrt(i); break;
                case 'i^i': term = Math.pow(i, i); break; case 'i+k': term = i + k; break;
                case 'i*k': term = i * k; break; case 'k-i': if (k < i) return null; term = k - i; break;
                case 'i-k': if (i < k) return null; term = i - k; break;
                case 'i^k': term = Math.pow(i, k); break; case 'k^i': term = Math.pow(k, i); break;
                default: return null;
            }
            if (!isFinite(term)) return null;
            sum += term;
        }
        return sum;
    }
}
