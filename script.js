// --- DOM Elements ---
const modeSelect = document.getElementById('mode');
const levelSelect = document.getElementById('level');
const inputsContainer = document.getElementById('inputs-container');
const targetInput = document.getElementById('target');
const solveBtn = document.getElementById('solve-btn');
const resultsContainer = document.getElementById('results-container');
const mainSolutionDisplay = document.getElementById('main-solution-display');
const solutionSwitcher = document.getElementById('solution-switcher');
const closestDiv = document.getElementById('closest-solution');
const noSolutionDiv = document.getElementById('no-solution');
const spinner = document.getElementById('spinner');

let solverWorker;
let currentSolutions = [];

// --- Initial Setup ---
const updateInputs = () => {
    const numInputs = modeSelect.value === '4' ? 4 : 5;
    targetInput.placeholder = `${numInputs === 4 ? 2 : 3} หลัก`;
    inputsContainer.innerHTML = '';
    for (let i = 0; i < numInputs; i++) {
        const input = document.createElement('input');
        input.type = 'number'; input.className = 'num-input'; input.placeholder = '#';
        inputsContainer.appendChild(input);
    }
};
modeSelect.addEventListener('change', updateInputs);
updateInputs();

// --- Main Solve Button Event ---
solveBtn.addEventListener('click', () => {
    const numbers = Array.from(inputsContainer.children).map(input => parseInt(input.value)).filter(n => !isNaN(n));
    const target = parseInt(targetInput.value);
    const level = levelSelect.value;
    const numInputs = parseInt(modeSelect.value);
    if (numbers.length !== numInputs || isNaN(target)) {
        alert('กรุณาป้อนข้อมูลให้ครบถ้วน');
        return;
    }
    
    // Reset UI
    resultsContainer.classList.remove('hidden');
    mainSolutionDisplay.innerHTML = ''; solutionSwitcher.innerHTML = '';
    closestDiv.innerHTML = ''; noSolutionDiv.innerHTML = '';
    spinner.classList.remove('hidden'); solveBtn.disabled = true;

    if (solverWorker) solverWorker.terminate();
    solverWorker = new Worker('solver.js');
    solverWorker.postMessage({ numbers, target, level });

    solverWorker.onmessage = (e) => {
        spinner.classList.add('hidden');
        solveBtn.disabled = false;
        displayResults(e.data);
        solverWorker.terminate(); 
    };
    
    solverWorker.onerror = (e) => {
        console.error('Error in solver worker:', e);
        spinner.classList.add('hidden');
        solveBtn.disabled = false;
        noSolutionDiv.innerHTML = '<h4>ขออภัย</h4><p>การคำนวณซับซ้อนเกินไป หรือพบข้อผิดพลาดที่ไม่คาดคิด</p>';
    }
});

// --- Display Logic ---
function displayResults(result) {
    currentSolutions = result.solutions; // The solver now returns truly unique solutions
    mainSolutionDisplay.innerHTML = ''; solutionSwitcher.innerHTML = '';
    closestDiv.innerHTML = ''; noSolutionDiv.innerHTML = '';

    if (currentSolutions.length > 0) {
        renderSolution(currentSolutions[0]);
        if (currentSolutions.length > 1) {
            solutionSwitcher.innerHTML = `<h3>วิธีแบบอื่น:</h3>`;
            currentSolutions.forEach((sol, index) => {
                const btn = document.createElement('button');
                btn.className = 'solution-btn';
                btn.textContent = `วิธีที่ ${index + 1}`;
                if (index === 0) btn.classList.add('active');
                btn.onclick = () => {
                    renderSolution(currentSolutions[index]);
                    document.querySelectorAll('.solution-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                };
                solutionSwitcher.appendChild(btn);
            });
        }
    } else {
        if (result.closest && result.closest.value !== Infinity) {
            closestDiv.innerHTML = `<h3>ไม่พบคำตอบที่ตรงเป้าหมาย<br>วิธีที่ใกล้เคียงที่สุดคือ:</h3>`;
            // Use a try-catch as a fallback to ensure something always displays
            try {
                const derivationList = generateDerivationList(result.closest);
                closestDiv.appendChild(derivationList);
            } catch (err) {
                 console.error("Failed to generate steps, showing fallback:", err);
                 const fallbackLi = document.createElement('div');
                 fallbackLi.className = 'derivation-steps';
                 fallbackLi.innerHTML = `<li class="final-step">${result.closest.str} = ${result.closest.value}</li>`;
                 closestDiv.appendChild(fallbackLi);
            }
        } else {
            noSolutionDiv.innerHTML = '<h4>ไม่พบคำตอบ</h4><p>ไม่พบวิธีการคำนวณเพื่อให้ได้ผลลัพธ์ตามเป้าหมาย</p>';
        }
    }
}

function renderSolution(solution) {
    mainSolutionDisplay.innerHTML = `<h3>ขั้นตอนการคิดแบบที่ ${currentSolutions.indexOf(solution) + 1}:</h3>`;
    const derivationList = generateDerivationList(solution);
    mainSolutionDisplay.appendChild(derivationList);
}

function generateDerivationList(item) {
    const list = document.createElement('ul');
    list.className = 'derivation-steps';
    const finalEquationStr = item.str;

    const subExpressions = [];
    const queue = [item];
    const visited = new Set();
    while(queue.length > 0) {
        const node = queue.shift();
        if (!node || !node.derivation || visited.has(node.str)) continue;
        visited.add(node.str);
        subExpressions.push(node);
        node.derivation.inputs.forEach(inp => queue.push(inp));
    }
    subExpressions.sort((a, b) => a.complexity - b.complexity);
    
    const steps = [];
    let currentEquation = finalEquationStr;

    for (const sub of subExpressions) {
        const regex = new RegExp(sub.str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const newEquation = currentEquation.replace(regex, sub.derivation.resultStr);
        if (newEquation !== currentEquation) {
            steps.push(newEquation);
            currentEquation = newEquation;
        }
    }

    steps.forEach(stepStr => {
        const li = document.createElement('li');
        try {
            const finalStr = `${stepStr} = ${item.value}`.replace(/\*/g, '\\times');
            katex.render(finalStr, li, { throwOnError: false, displayMode: true });
        } catch (e) { li.textContent = `${stepStr} = ${item.value}`; }
        list.appendChild(li);
    });

    const finalLi = document.createElement('li');
    finalLi.className = 'final-step';
    try {
        const finalStr = `${finalEquationStr} = ${item.value}`.replace(/\*/g, '\\times');
        katex.render(finalStr, finalLi, { throwOnError: false, displayMode: true });
    } catch (e) { finalLi.textContent = `${finalEquationStr} = ${item.value}`; }
    list.appendChild(finalLi);
    
    return list;
}
