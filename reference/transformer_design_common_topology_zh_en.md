# Common Topology Transformer Design Formulas and Core Selection Guide
# 常用拓扑变压器设计公式与磁芯选型指南

## 1. Design flow / 设计流程

### 1.1 Common design sequence / 常见设计流程
1. Determine topology: flyback, forward, push-pull, half-bridge, full-bridge / 确定拓扑：反激、正激、推挽、半桥、全桥
2. Set electrical targets: Vin, Vout, Iout, fs, efficiency / 确定电气指标：输入电压、输出电压、输出电流、开关频率、效率
3. Estimate duty cycle / 估算占空比
4. Determine turns ratio / 确定变比
5. Select core / 选择磁芯
6. Calculate turns, flux density, current, copper loss / 计算匝数、磁通密度、电流、铜损
7. Verify saturation, temperature rise, EMI / 验证饱和、温升、EMI
8. Prototype test and optimization / 样机测试和优化

---

## 2. Common formulas / 常用公式

### 2.1 Output power / 输出功率

Pout = Vout × Iout

Pout = 输出电压 × 输出电流

Example / 例：
- Vout = 12 V
- Iout = 5 A
- Pout = 60 W

### 2.2 Input power / 输入功率

Pin = Pout / η

其中：
- η = efficiency / 效率

Example / 例：
- Pout = 60 W
- η = 0.9
- Pin = 66.7 W

### 2.3 Duty cycle is topology dependent / 占空比与拓扑有关

#### 2.3.1 Forward converter / 单端正激

Vout = D × Vin × Ns / Np

So / 因此:

Ns / Np ≈ Vout / (D × Vin)

Where / 其中：
- D = duty cycle / 占空比
- Np = primary turns / 初级匝数
- Ns = secondary turns / 次级匝数

#### 2.3.2 Flyback converter / 反激变换器

Vout = D × Vin × Ns / Np × 1 / (1 - D)

Or rough estimate / 或近似估算：

Ns / Np ≈ Vout / (D × Vin) × (1 - D)

#### 2.3.3 Push-pull / 推挽

Vout ≈ 2 × D × Vin × Ns / Np

#### 2.3.4 Half-bridge / 半桥

Vout ≈ D × Vin × Ns / Np

#### 2.3.5 Full-bridge / 全桥

Vout ≈ 2 × D × Vin × Ns / Np

---

## 3. Flux density and turns calculation / 磁通密度与匝数计算

### 3.1 Core flux density / 磁芯磁通密度

For a transformer / 对变压器：

B = (V × D) / (Np × Ae × fs)

Where / 其中：
- B = flux density / 磁通密度
- V = applied voltage / 施加电压
- D = duty cycle / 占空比
- Np = primary turns / 初级匝数
- Ae = core effective cross-sectional area / 磁芯有效截面积
- fs = switching frequency / 开关频率

This must satisfy / 需要满足：

B < Bmax

Bmax depends on material and frequency / Bmax 由材料和频率决定

### 3.2 Primary turns estimate / 初级匝数估算

Np ≈ (Vin(min) × Dmax) / (Bmax × Ae × fs)

Where / 其中：
- Vin(min) = minimum input voltage / 最小输入电压
- Dmax = max duty cycle / 最大占空比
- Bmax = allowable flux density / 允许磁通密度
- Ae = core effective area / 磁芯有效截面积
- fs = switching frequency / 开关频率

### 3.3 Secondary turns estimate / 次级匝数估算

Ns = Np × (Vout + Vf) / (D × Vin)

For a forward converter / 对正激：

Ns = Np × Vout / (D × Vin)

Where / 其中：
- Vf = diode forward drop / 二极管正向压降

---

## 4. Core selection / 磁芯选型

### 4.1 Core selection principle / 磁芯选择原则

Key factors / 关键因素：
- output power / 输出功率
- switching frequency / 开关频率
- input voltage range / 输入电压范围
- flux density limit / 磁通密度限制
- temperature rise / 温升
- window area / 窗口面积
- safety isolation / 安全隔离要求

### 4.2 Core area product / 磁芯面积乘积

AP = Ae × Aw

Where / 其中：
- Ae = effective core area / 有效截面积
- Aw = window area / 窗口面积

A larger AP means the core can handle more power / AP 越大，说明磁芯可承载更大功率

### 4.3 Typical core families / 常见磁芯系列

- EE, EI, EFD, ER, PQ, RM, toroid / 常见磁芯族：EE、EI、EFD、ER、PQ、RM、环形

Typical usage / 常见用途：
- low to medium power / 低中功率：EE / EFD / EI
- medium to high power / 中高功率：PQ / RM / ER
- high power, compact design / 高功率紧凑设计：PQ / RM

### 4.4 Experience-based selection / 工程经验选择法

For rough design / 粗估：
- 20–50 W: EE16 / EE19 / EFD25
- 50–100 W: EE25 / EE30 / EFD30
- 100–300 W: EER28 / EER35 / PQ26 / PQ32
- 300 W and above / 300W 以上：PQ35 / PQ40 / RM8 / RM10

This is only a rough range / 仅为经验参考，最终仍需核算

---

## 5. Current and copper calculation / 电流和铜损计算

### 5.1 Primary peak current / 初级峰值电流

For a forward converter / 对正激：

Ipk ≈ Iin / D

For flyback / 对反激：

Ipk ≈ 2 × Pin / Vin(min)

### 5.2 Secondary RMS current / 次级 RMS 电流

For forward / 对正激：

Isec_rms ≈ Iout × √D

### 5.3 Wire cross-sectional area / 线径截面积

A_wire = I / J

Where / 其中：
- J = current density / 电流密度
- Typical range / 常见范围：3–8 A/mm²

### 5.4 Copper loss / 铜损

Pcu = I²R

R = resistivity × length / area

In engineering / 工程上要看：
- wire diameter / 线径
- window utilization / 窗口利用率
- fill factor / 填充因子
- skin effect / 趋肤效应

---

## 6. Magnetic gap / 气隙设计

### 6.1 Why gap is needed / 为什么需要气隙

- prevent saturation / 防止饱和
- store energy / 存储能量
- improve energy transfer in flyback / 提高反激储能能力

### 6.2 Practical approach / 实际做法

- For flyback / 反激： often need gap / 一般需要气隙
- For forward / 正激： sometimes use gap or special core design depending on topology / 有时也需要气隙，取决于具体结构

The gap is usually tuned by prototype and measurement / 气隙通常通过原型测试和测量调整

---

## 7. Typical formulas for common topologies / 常用拓扑典型公式

### 7.1 Forward converter / 正激变换器

Vout = D × Vin × Ns / Np

Np = (Vin(min) × Dmax) / (Bmax × Ae × fs)

Ns = Np × Vout / (D × Vin)

### 7.2 Flyback converter / 反激变换器

Vout = D × Vin × Ns / Np × 1 / (1 - D)

Np ≈ (Vin(min) × Dmax) / (Bmax × Ae × fs)

Ns ≈ Np × Vout / (D × Vin) × (1 - D)

### 7.3 Push-pull / 推挽

Vout ≈ 2 × D × Vin × Ns / Np

### 7.4 Half-bridge / 半桥

Vout ≈ D × Vin × Ns / Np

### 7.5 Full-bridge / 全桥

Vout ≈ 2 × D × Vin × Ns / Np

---

## 8. Design summary / 设计总结

A practical design process is usually:

- determine topology / 确定拓扑
- define electrical targets / 确定目标参数
- estimate duty cycle / 估算占空比
- calculate turns ratio / 计算变比
- select core / 选磁芯
- calculate turns / 计算匝数
- evaluate Bmax and thermal performance / 检查磁通密度和温升
- adjust with prototype measurement / 通过样机测试修正

This is the normal engineering workflow / 这是工程上常用的正常流程

---

## 9. Interview answer template (Chinese + English) / 面试回答模板（中英对照）

### Chinese / 中文

“变压器参数设计通常按拓扑和设计流程来做，首先确定输入输出指标，例如 Vin、Vout、Iout、频率和效率；其次根据拓扑选择占空比和变比；再根据功率和频率选择磁芯，估算磁通密度和匝数；随后计算一次侧/二次侧电流、线径和铜损；最后做原型验证，检查磁芯饱和、温升和 EMI，对参数进行修正。工程上很多时候会参考参考方案和厂家手册，再通过实验验证最终参数，因此我更偏工程实践中的参数估算、适配和验证。”

### English / 英文

"Transformer parameter design is usually done according to the topology and design flow. First, we determine the electrical targets such as Vin, Vout, Iout, switching frequency, and efficiency. Then we estimate the duty cycle and turns ratio according to the topology. Next, we select the magnetic core based on power and frequency, then estimate flux density and turns. After that, we calculate primary/secondary current, wire size, and copper loss. Finally, we validate the design with a prototype to check saturation, temperature rise, and EMI, and then adjust the parameters if needed. In practice, we often rely on reference designs and manufacturer guidance, and then use prototype testing to confirm the final values."

---

## 10. Final principle / 最终原则

You do not need to claim that you can fully design a transformer from scratch in every detail from pure formula alone.

You only need to show that you understand:
- topology / 拓扑
- duty cycle / 占空比
- turns ratio / 变比
- flux density / 磁通密度
- core selection / 磁芯选型
- prototype verification / 样机验证

This is enough for most hardware interview questions.

你不需要声称自己能完全从零纯公式设计每个变压器的所有参数。

你只需要体现：
- 知道拓扑
- 知道占空比
- 知道变比
- 知道磁通密度
- 知道磁芯选型
- 知道样机验证

这已经足够应对多数硬件面试问题。
