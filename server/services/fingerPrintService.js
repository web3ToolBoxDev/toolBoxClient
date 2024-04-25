const config = require('../../config').getInstance();
const path = require('path');
const fs = require('fs');
const fpDataPath = path.join(config.getAssetsPath(), 'fpData.json');
let fpData = {language:[],windowsUserAgent:[],windowsWebgl:[],macUserAgent:[],macWebgl:[]}

//检查是否存在fpData.json文件，如果存在则加载
if(fs.existsSync(fpDataPath)){
    fpData = JSON.parse(fs.readFileSync(fpDataPath));
}else{
    const fpDataJson = JSON.stringify(fpData);
    fs.writeFileSync(fpDataPath,fpDataJson);
}
// fpDb的结构为{language:[],windowsUserAgent:[],windowsWebgl:[{vendor:'',renderer:''}],macUserAgent:[],macWebgl:[{vendor:'',renderer:''}]}
async function loadFingerPrints(filePath) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath));
        //原fpDb中是否含有相同的数据，如果有则不导入
        for (let i = 0; i < data.language.length; i++){
            if (!fpData.language.includes(data.language[i])){
                fpData.language.push(data.language[i]);
            }
        }
        for (let i = 0; i < data.windowsUserAgent.length; i++){
            if (!fpData.windowsUserAgent.includes(data.windowsUserAgent[i])){
                fpData.windowsUserAgent.push(data.windowsUserAgent[i]);
            }
        }
        for (let i = 0; i < data.windowsWebgl.length; i++){
            if (!fpData.windowsWebgl.includes(data.windowsWebgl[i])){
                fpData.windowsWebgl.push(data.windowsWebgl[i]);
            }
        }
        for (let i = 0; i < data.macUserAgent.length; i++){
            if (!fpData.macUserAgent.includes(data.macUserAgent[i])){
                fpData.macUserAgent.push(data.macUserAgent[i]);
            }
        }
        for (let i = 0; i < data.macWebgl.length; i++){
            if (!fpData.macWebgl.includes(data.macWebgl[i])){
                fpData.macWebgl.push(data.macWebgl[i]);
            }
        }
        const fpDataJson = JSON.stringify(fpData);
        fs.writeFileSync(fpDataPath,fpDataJson);
        return '导入指纹成功';
    }catch (e) {
        console.error(e);
        return '导入指纹失败';
    }
}
// 获取数据库中指纹信息数量
async function getFingerPrintCount() {
    const count = {language:0,windowsUserAgent:0,windowsWebgl:0,macUserAgent:0,macWebgl:0};
    if (fpData.language){
        count.language = fpData.language.length;
    }
    if (fpData.windowsUserAgent){
        count.windowsUserAgent = fpData.windowsUserAgent.length;
    }
    if (fpData.windowsWebgl){
        count.windowsWebgl = fpData.windowsWebgl.length;
    }
    if (fpData.macUserAgent){
        count.macUserAgent = fpData.macUserAgent.length;
    }
    if (fpData.macWebgl){
        count.macWebgl = fpData.macWebgl.length;
    }
    return count;
}
// 基于数据库随机生成指纹，从userAgent选取一条，language随机选取一条，webglVendor，webglRenderer随机选取一条
async function generateRandomFingerPrint() {
    const fingerprint = {};
    const count = await getFingerPrintCount();
    if (count === 0) {
        return fingerprint;
    }
    if (count.language){
        fingerprint.language = fpData.language[Math.floor(Math.random() * count.language)];
    }
    //根据userAgent的数量随机采用windows或mac的指纹
    if (Math.random() < count.windowsUserAgent / (count.windowsUserAgent + count.macUserAgent)){
        if (count.windowsUserAgent){
            fingerprint.userAgent = fpData.windowsUserAgent[Math.floor(Math.random() * count.windowsUserAgent)];
        }
        if (count.windowsWebgl){
            const webgl = fpData.windowsWebgl[Math.floor(Math.random() * count.windowsWebgl)];
            fingerprint.webglVendor = webgl.vendor;
            fingerprint.webglRenderer = webgl.renderer;
        }
    }else{
        if (count.macUserAgent){
            fingerprint.userAgent = fpData.macUserAgent[Math.floor(Math.random() * count.macUserAgent)];
        }
        if (count.macWebgl){
            const webgl = fpData.macWebgl[Math.floor(Math.random() * count.macWebgl)];
            fingerprint.webglVendor = webgl.vendor;
            fingerprint.webglRenderer = webgl.renderer;
        }
    }

    return fingerprint;
}
//清空指纹
async function clearFingerPrints() {
    fpData = {language:[],windowsUserAgent:[],windowsWebgl:[],macUserAgent:[],macWebgl:[]};
    const fpDataJson = JSON.stringify(fpData);
    fs.writeFileSync(fpDataPath,fpDataJson);
    return '清空指纹成功';
}
module.exports = {
    loadFingerPrints,
    generateRandomFingerPrint,
    getFingerPrintCount,
    clearFingerPrints
};