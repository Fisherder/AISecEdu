#!/bin/bash
# Batch-generate teaching cases for all 8 core courses.
# Each course gets 3-5 topic-based lessons with mixed artifacts.
# Usage: bash scripts/gen-teaching-cases.sh
# Output: lessons saved to data/lessons/, viewable at /prep

API=http://localhost:3001
LOG=scripts/gen-teaching-cases.log
> "$LOG"

gen_case() {
  local course="$1" topic="$2" desc="$3"
  local title="${course}：${topic}"
  echo "▶ $title" | tee -a "$LOG"

  # Create lesson
  local lid=$(curl -s --noproxy '*' -X POST "$API/api/lessons" \
    -H 'Content-Type: application/json' \
    -d "{\"title\":\"$title\",\"subjectProfile\":\"cybersecurity\",\"courseId\":\"$course\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

  if [ -z "$lid" ]; then echo "  ✗ create failed" | tee -a "$LOG"; return; fi

  # Generate outlines
  local outlines=$(curl -s --noproxy '*' --max-time 120 -X POST "$API/api/lessons/$lid/outlines" \
    -H 'Content-Type: application/json' \
    -d "{\"requirement\":\"为《$course》课程的「$topic」生成一节课（3-5个场景）\",\"courseId\":\"$course\"}" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(json.dumps(d.get('outlines',[])))" 2>/dev/null)

  if [ "$outlines" = "[]" ] || [ -z "$outlines" ]; then
    echo "  ✗ outline failed, fallback to single artifacts" | tee -a "$LOG"
    # Fallback: generate 3 single artifacts
    curl -s --noproxy '*' --max-time 120 -X POST "$API/api/lessons/$lid/artifacts" \
      -H 'Content-Type: application/json' \
      -d "{\"mode\":\"single\",\"type\":\"slide\",\"title\":\"$topic 概述\",\"description\":\"$desc\",\"quality\":\"fast\"}" > /dev/null 2>&1
    curl -s --noproxy '*' --max-time 120 -X POST "$API/api/lessons/$lid/artifacts" \
      -H 'Content-Type: application/json' \
      -d "{\"mode\":\"single\",\"type\":\"quiz\",\"title\":\"$topic 测验\",\"description\":\"$desc\",\"quality\":\"fast\"}" > /dev/null 2>&1
    echo "  ✓ 2 artifacts (fallback)" | tee -a "$LOG"
    return
  fi

  # Batch-generate from outlines
  local count=$(curl -s --noproxy '*' --max-time 600 -X POST "$API/api/lessons/$lid/artifacts" \
    -H 'Content-Type: application/json' \
    -d "{\"mode\":\"batch\",\"outlines\":$outlines,\"quality\":\"fast\"}" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('artifacts',[])))" 2>/dev/null)

  if [ -z "$count" ]; then count="0"; fi
  echo "  ✓ $count artifacts | lesson=$lid" | tee -a "$LOG"
}

echo "=== 网络空间安全学院主干课教学案例批量生成 ===" | tee -a "$LOG"
echo "开始: $(date)" | tee -a "$LOG"

# 1. 网络空间安全导论
gen_case "网络空间安全导论" "信息安全CIA三性与安全模型" "讲解机密性、完整性、可用性三大安全属性，以及经典安全模型（Bell-LaPadula、Biba）"
gen_case "网络空间安全导论" "常见网络威胁与攻击面" "介绍SQL注入、XSS、DDoS、钓鱼等常见攻击类型及其攻击面分析"
gen_case "网络空间安全导论" "安全防护框架与法规" "讲解纵深防御体系、《网络安全法》《数据安全法》核心条款"

# 2. 现代密码学
gen_case "现代密码学" "分组密码与工作模式" "AES算法原理、ECB/CBC/CTR/GCM工作模式及其安全性分析"
gen_case "现代密码学" "公钥密码RSA与ECC" "RSA加密/签名原理、ECC椭圆曲线、密钥分配协议"
gen_case "现代密码学" "哈希函数与数字签名" "SHA-2/SHA-3、HMAC、数字签名体制与PKI证书链"
gen_case "现代密码学" "密码分析与攻击" "差分/线性密码分析、侧信道攻击、穷举与字典攻击"

# 3. 计算机网络
gen_case "计算机网络" "TCP/IP协议安全分析" "TCP三次握手漏洞、IP欺骗、会话劫持分析"
gen_case "计算机网络" "网络嗅探与防御" "Wireshark抓包分析、ARP欺骗、MAC泛洪攻击与防御"
gen_case "计算机网络" "DNS安全与攻击" "DNS欺骗、DNS隧道、DNSSEC防护机制"

# 4. 操作系统
gen_case "操作系统" "访问控制与权限安全" "DAC/MAC/RBAC模型、Linux文件权限、Capabilities机制"
gen_case "操作系统" "进程隔离与内存保护" "虚拟内存、ASLR/DEP/CFG、沙箱隔离机制"
gen_case "操作系统" "安全审计与日志分析" "系统日志审计、入侵检测、Syslog与SIEM集成"

# 5. 汇编语言与逆向工程
gen_case "汇编语言与逆向工程" "x86汇编与静态分析" "寄存器/指令集、反汇编技术、IDA Pro/Ghidra分析方法"
gen_case "汇编语言与逆向工程" "动态调试与反调试" "GDB调试、断点技术、反调试检测与绕过"
gen_case "汇编语言与逆向工程" "恶意代码分析流程" "静态特征提取、动态行为监控、沙箱分析"

# 6. 网络安全
gen_case "网络安全" "DDoS攻击原理与防护" "SYN Flood、反射放大、流量清洗与黑洞路由"
gen_case "网络安全" "防火墙与入侵检测系统" "包过滤/状态检测/应用层防火墙、IDS/IDS规则与部署"
gen_case "网络安全" "VPN与TLS安全协议" "IPSec/SSL VPN、TLS握手过程、证书验证与降级攻击防护"
gen_case "网络安全" "渗透测试方法论" "侦察→扫描→利用→后渗透→报告的标准流程"

# 7. 软件安全
gen_case "软件安全" "栈溢出与ROP攻击" "缓冲区溢出原理、返回地址覆盖、ROP链构造与ASLR/DEP缓解"
gen_case "软件安全" "堆漏洞与利用" "Use-After-Free、Double Free、堆喷射技术"
gen_case "软件安全" "模糊测试与漏洞挖掘" "覆盖率引导fuzzing、AFL/libFuzzer、崩溃分析"
gen_case "软件安全" "安全编码规范" "输入验证、参数化查询、输出编码、OWASP Top 10防护"

# 8. 信息系统安全
gen_case "信息系统安全" "安全评估与等级保护" "等保2.0标准、风险评估模型、安全域划分"
gen_case "信息系统安全" "身份认证与访问管理" "多因素认证、SSO/SAML/OAuth、零信任架构"
gen_case "信息系统安全" "应急响应与灾难恢复" "事件响应六阶段、取证流程、BCP/DRP规划"

echo "" | tee -a "$LOG"
echo "=== 完成: $(date) ===" | tee -a "$LOG"
echo "查看所有课程: $API/prep" | tee -a "$LOG"
