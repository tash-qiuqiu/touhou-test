const { createApp, ref, computed, onMounted, nextTick } = Vue;

createApp({
    setup() {
        const step = ref('start'); // 流程：start -> pre_survey -> testing -> result
        const questions = ref([]); 
        const charactersData = ref({}); 
        const currentIndex = ref(0); 
        const answers = ref([]); 
        
        const finalResultCode = ref(''); 
        const matchedCharacter = ref({}); 
        const isNeutral = ref(false); 

        // 【新增】：学术调查问卷的数据绑定
        const userInfo = ref({
            university: '',
            attendCount: '',
            orgCount: '',
            roles: [],
            otherRole: '',
            isStable: '',
            audience: '',
            phone: ''
        });

        const options = [
            { label: "非常符合", value: 2 },
            { label: "比较符合", value: 1 },
            { label: "中立", value: 0 },
            { label: "不太符合", value: -1 },
            { label: "非常不符合", value: -2 }
        ];

        onMounted(async () => {
            try {
                const qRes = await fetch('./data/questions.json');
                const qData = await qRes.json();
                questions.value = seededShuffle(qData);
                
                const cRes = await fetch('./data/characters.json');
                charactersData.value = await cRes.json();
            } catch (error) {
                console.error("数据加载失败！", error);
            }
        });

        const currentQuestion = computed(() => questions.value[currentIndex.value]);

        // 【新增】：校验基本信息是否填写完整
        const isUserInfoComplete = computed(() => {
            return userInfo.value.university.trim() !== '' &&
                   userInfo.value.attendCount !== '' &&
                   userInfo.value.orgCount !== '' &&
                   userInfo.value.roles.length > 0 &&
                   userInfo.value.isStable !== '' &&
                   userInfo.value.audience !== '';
        });

        // 从开始页 -> 进入问卷页
        const startSurvey = () => { 
            step.value = 'pre_survey'; 
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        // 从问卷页 -> 进入核心60题测试
        const startMainTest = () => {
            if (!isUserInfoComplete.value) return;
            step.value = 'testing';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        const selectOption = (value) => {
            answers.value[currentIndex.value] = {
                id: currentQuestion.value.id,
                dim: currentQuestion.value.dim,
                pole: currentQuestion.value.pole,
                score: value
            };
            
            if (currentIndex.value < questions.value.length - 1) {
                currentIndex.value++;
            } else {
                calculateResult();
            }
        };

        const prevQuestion = () => { 
            if (currentIndex.value > 0) currentIndex.value--; 
        };

        const calculateResult = () => {
            let dimScores = { BD: 0, AC: 0, UI: 0, HE: 0, RT: 0, WP: 0 };
            
            answers.value.forEach(ans => {
                if (ans.dim !== 'OTHER') dimScores[ans.dim] += ans.score * ans.pole;
            });

            let resultCode = "";
            let zeroCount = 0;

            if (dimScores.BD > 0) resultCode += "B"; else if (dimScores.BD < 0) resultCode += "D"; else { resultCode += "D"; zeroCount++; }
            if (dimScores.AC > 0) resultCode += "A"; else if (dimScores.AC < 0) resultCode += "C"; else { resultCode += "C"; zeroCount++; }
            if (dimScores.UI > 0) resultCode += "U"; else if (dimScores.UI < 0) resultCode += "I"; else { resultCode += "I"; zeroCount++; }
            if (dimScores.HE > 0) resultCode += "H"; else if (dimScores.HE < 0) resultCode += "E"; else { resultCode += "E"; zeroCount++; }
            if (dimScores.RT > 0) resultCode += "R"; else if (dimScores.RT < 0) resultCode += "T"; else { resultCode += "T"; zeroCount++; }
            if (dimScores.WP > 0) resultCode += "W"; else if (dimScores.WP < 0) resultCode += "P"; else { resultCode += "P"; zeroCount++; }

            finalResultCode.value = resultCode;
            isNeutral.value = zeroCount >= 4;

            if (isNeutral.value) {
                matchedCharacter.value = charactersData.value["NEUTRAL"];
            } else {
                matchedCharacter.value = charactersData.value[resultCode] || charactersData.value["DEFAULT"];
            }

            step.value = 'result';
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            nextTick(() => { 
                drawRadarChart(dimScores); 
            });

            silentUploadData();
        };

        const seededShuffle = (array, seed = 114514) => {
            let m = array.length, t, i;
            while (m) {
                seed = (seed * 9301 + 49297) % 233280;
                i = Math.floor((seed / 233280) * m--);
                t = array[m]; array[m] = array[i]; array[i] = t;
            }
            return array;
        };

        const drawRadarChart = (scores) => {
            const canvas = document.getElementById('radarChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const mapScore = (val) => Math.max(0, Math.min(100, ((val + 20) / 40) * 100));

            new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: ['商业现实(B)', '集权效率(A)', '联合开放(U)', '硬核企划(H)', '反叛革新(R)', '事业爆肝(W)'],
                    datasets: [{
                        label: '倾向',
                        data: [
                            mapScore(scores.BD), mapScore(scores.AC), mapScore(scores.UI), 
                            mapScore(scores.HE), mapScore(scores.RT), mapScore(scores.WP)
                        ],
                        backgroundColor: 'rgba(220, 38, 38, 0.2)',
                        borderColor: 'rgba(220, 38, 38, 1)',
                        pointBackgroundColor: 'rgba(220, 38, 38, 1)',
                        pointBorderColor: '#fff'
                    }]
                },
                options: {
                    scales: {
                        r: {
                            angleLines: { color: 'rgba(0, 0, 0, 0.1)' },
                            grid: { color: 'rgba(0, 0, 0, 0.1)' },
                            pointLabels: { font: { size: 12, family: 'sans-serif', weight: 'bold' }, color: '#374151' },
                            ticks: { display: false, min: 0, max: 100 }
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        };

        const silentUploadData = () => {
            // 【重要数据处理】：把学术调查数据和答题明细打包成一个大 JSON，塞进 answers 里
            const combinedData = {
                researchInfo: userInfo.value,
                testAnswers: answers.value
            };

            const payload = {
                result: finalResultCode.value,
                character: matchedCharacter.value.name || "未知",
                isNeutral: isNeutral.value ? 'true' : 'false',
                submitTime: new Date().toISOString(),
                answers: JSON.stringify(combinedData) // 完美兼容你原有的阿里云后台，无需改库！
            };

            // 【务必填写你的阿里云函数公网地址】
            const WEBHOOK_URL = "https://savesurvey-wdzwrthfoe.cn-hangzhou.fcapp.run";

            fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(e => {
                console.log("Analytics sync failed, but it's okay.");
            });
        };

        return { 
            step, questions, currentIndex, currentQuestion, options, 
            finalResultCode, isNeutral, matchedCharacter, 
            userInfo, isUserInfoComplete,
            startSurvey, startMainTest, selectOption, prevQuestion
        };
    }
}).mount('#app');