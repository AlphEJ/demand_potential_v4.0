// ========================================================================
// DPU 需求势能引擎 · 通用层
// 目标：先做"情绪基调 → 需求分布 → 表达风格"三段式分析，装逼指数只是画像的一个维度。
// 导出：
//   · DPU_NEEDS            — 5 个需求维度定义（D2/D4/D5/D6/D8）
//   · SIGNAL_PATTERNS      — 7 类装逼信号规则库
//   · SHOWOFF_EMOJIS       — 装逼表情符号
//   · NEGATIVE_PATTERNS    — 6 类负面情绪信号（焦虑/自我否定/抱怨/无助/负面情境/低落）
//   · NEGATIVE_EMOJIS      — 36 个负面情绪 emoji
//   · BRAGGING_PERSONALITY_TYPES — 8 种装逼人格类型（仅在装逼占主导时使用）
//   · analyzeText(text)    — 对一条消息做完整画像（情绪 + 需求 + 装逼信号 + 表达风格）
//   · analyzeRole(messages) — 对一组消息做聚合分析（某个人/某段对话）
//   · inferBraggingPersonality(roleAnalysis) — 从画像推断装逼类型（仅在装逼占主导时返回）
// ========================================================================

// ========== 需求维度定义（5 个） ==========
// D2 社交归属 · D4 尊重认可 · D5 认知求知 · D6 审美价值 · D8 自由掌控
export interface DpuNeed {
  id: 'D2' | 'D4' | 'D5' | 'D6' | 'D8'
  name: string
  color: string
  gradientFrom: string
  gradientTo: string
  description: string
}

export const DPU_NEEDS: DpuNeed[] = [
  { id: 'D4', name: '尊重认可', color: '#6366F1', gradientFrom: '#8b5cf6', gradientTo: '#6366f1', description: '希望被认可、被尊重、被仰视' },
  { id: 'D6', name: '审美价值', color: '#EC4899', gradientFrom: '#ec4899', gradientTo: '#f43f5e', description: '通过品味、格调、细节展示自身价值' },
  { id: 'D8', name: '自由掌控', color: '#8B5CF6', gradientFrom: '#f59e0b', gradientTo: '#d97706', description: '暗示自己有选择权、能主导节奏和资源' },
  { id: 'D2', name: '社交归属', color: '#10B981', gradientFrom: '#06b6d4', gradientTo: '#14b8a6', description: '想在群体中有地位、被接纳、被需要' },
  { id: 'D5', name: '认知求知', color: '#0EA5E9', gradientFrom: '#0ea5e9', gradientTo: '#38bdf8', description: '通过输出知识、见解、信息差获得话语权' },
]

// ========== 装逼信号规则库 ==========
export interface SignalPattern {
  type: string
  name: string
  keywords: string[]
  needs: Partial<Record<DpuNeed['id'], number>>
  color: string
  baseScore: number
}

export const SIGNAL_PATTERNS: SignalPattern[] = [
  { type: 'reverse_brag', name: '反向炫耀', keywords: ['也就那样', '也就那样吧', '不贵不贵', '一般般', '随手', '也就那样了', '也就一般', '随便搞的', '随便弄的', '偶然', '碰巧', '刚好', '侥幸', '运气好', '也就随便', '低调低调', '低调点', '其实也没什么', '其实也没什么的', '其实都没有', '说实在的也没什么', '还好还好', '还行吧', '就那样', '就那样吧', '也没什么', '没什么啦', '也还行', '不怎么样', '随便搞搞'], needs: { 'D4': 0.55, 'D6': 0.25, 'D2': 0.20 }, color: '#EC4899', baseScore: 15 },
  { type: 'quantity_brag', name: '数量夸张', keywords: ['一桶', '一筐', '一整', '一打', '一堆', '一摞', '一箱', '一车', '一屋子', '一冰箱', '一抽屉', '一大', '整个', '全部', '所有', '100', '1000', '万', '百万', '千万', '亿', '几百', '几千', '几万', '几十万', '上百万', '千万级', '顶级', '顶配', '天花板', '王者', '满', '绝对', '史上', '从来', '一整天', '一整晚'], needs: { 'D8': 0.45, 'D4': 0.30, 'D2': 0.25 }, color: '#F59E0B', baseScore: 12 },
  { type: 'status_brag', name: '身份炫耀', keywords: ['我家', '我那边', '我们那边', '我兄弟', '我朋友', '有人脉', '有关系', '有渠道', '有朋友', '有人介绍', '家里人', '我哥', '我姐', '我爸', '我妈', '家里', '我老板', '我老大', '圈子', '圈内', '行业内', '业内', '行内', '在我们这', '在我们这儿', '认识', '很熟'], needs: { 'D2': 0.55, 'D4': 0.45 }, color: '#10B981', baseScore: 10 },
  { type: 'social_invite', name: '社交邀约', keywords: ['我带你', '带你', '陪你', '来我', '我请', '请你', '一起来', '一起去', '我安排', '安排一下', '招待', '招待你', '接待', '我来', '我请你', '我请客', '走我', '带你去', '我送你', '给你安排', '做东', '我做东', '包在我身上', '我来安排', '交给我', '带你们', '带大家'], needs: { 'D2': 0.50, 'D4': 0.30, 'D8': 0.20 }, color: '#14B8A6', baseScore: 10 },
  { type: 'ability_brag', name: '能力暗示', keywords: ['我能', '没问题', '小意思', '小事', '小菜', '轻松', '轻轻松松', '简单', '简单得很', '容易', '太容易了', '不费吹灰之力', '分分钟', '随时', '分分钟搞定', '随手', '随手搞', '随便搞', '随便弄', '随手就能', '随便就能', '没什么难度', '没什么难的', '没什么压力', '毫无压力', 'so easy', '小 case', '小case'], needs: { 'D4': 0.50, 'D8': 0.30, 'D2': 0.20 }, color: '#6366F1', baseScore: 12 },
  { type: 'knowledge_brag', name: '知识装逼', keywords: ['其实', '实际上', '事实上', '说真的', '说实话', '老实说', '你不懂', '你不懂的', '你不知道', '你不知道吧', '你不知道的', '你应该不知道', '你可能不知道', '你可能没听说过', '你可能没见过', '你见过没', '知道吗', '知不知道', '有没有听说过', '听说过吗', '不知道吧', '不懂了吧', '这你就不懂了', '告诉你吧', '让我告诉你', '其实吧', '事实是', '事实上是', '实际上是', '说白了', '说白了吧', '讲真', '讲真的', '说句实在话'], needs: { 'D5': 0.60, 'D4': 0.40 }, color: '#0EA5E9', baseScore: 10 },
  { type: 'taste_brag', name: '品味装逼', keywords: ['品味', '格调', '审美', '讲究', '有讲究', '不将就', '不能将就', '将就不了', '我比较挑', '我很挑', '我比较挑剔', '只选', '只选最好的', '只要最好的', '只挑好的', '品质', '质感', '做工', '细节', '细节之处', '细节方面', '品质感', '高级', '高级感', '上档次', '有品味', '有格调', '很有品味', '很有格调', '精致', '精致生活', '细节控', '细节决定'], needs: { 'D6': 0.65, 'D4': 0.35 }, color: '#EC4899', baseScore: 10 },
  { type: 'image_brag', name: '图片炫耀', keywords: ['图片：', '战绩', '段位', '王者', 'MVP', '五杀', '超神', '豪车', '保时捷', '宝马', '奔驰', '奥迪', '法拉利', '兰博基尼', '手表', '劳力士', '奢侈品', '爱马仕', '香奈儿', '马尔代夫', '巴黎', '东京', '米其林', '摆盘', '肌肉', '奖牌', '证书', '清华', '北大', '哈佛'], needs: { 'D4': 0.45, 'D6': 0.25, 'D2': 0.20, 'D8': 0.10 }, color: '#F59E0B', baseScore: 15 }
]

// ========== 装逼表情 ==========
export interface ShowoffEmoji {
  emoji: string; name: string; aliases: string[]; score: number
  needs: Partial<Record<DpuNeed['id'], number>>
}

export const SHOWOFF_EMOJIS: ShowoffEmoji[] = [
  { emoji: '😎', name: '墨镜', aliases: ['墨镜', '酷', '帅气', '得意墨镜'], score: 10, needs: { 'D4': 0.55, 'D2': 0.25, 'D8': 0.20 } },
  { emoji: '🧐', name: '单片眼镜', aliases: ['单片眼镜', '审视', '挑眉眼镜', '考究'], score: 10, needs: { 'D6': 0.60, 'D5': 0.40 } },
  { emoji: '🤨', name: '挑眉', aliases: ['挑眉', '抬眉', '疑惑挑眉', '不屑挑眉'], score: 5, needs: { 'D4': 0.60, 'D8': 0.40 } },
  { emoji: '😏', name: '得意', aliases: ['得意', '邪笑', '坏笑', '嘚瑟'], score: 8, needs: { 'D4': 0.50, 'D2': 0.30, 'D8': 0.20 } },
  { emoji: '🫠', name: '微笑融化', aliases: ['微笑融化', '融化笑', '破防笑'], score: 6, needs: { 'D2': 0.50, 'D6': 0.50 } },
  { emoji: '🙃', name: '倒脸', aliases: ['倒脸', '反转', '反脸'], score: 5, needs: { 'D8': 0.60, 'D4': 0.40 } },
  { emoji: '😌', name: '得意笑', aliases: ['得意笑', '满足', '舒心', '惬意'], score: 7, needs: { 'D4': 0.50, 'D2': 0.30, 'D6': 0.20 } },
  { emoji: '👑', name: '皇冠', aliases: ['皇冠', '王冠', '国王', '女王'], score: 15, needs: { 'D4': 0.55, 'D2': 0.30, 'D8': 0.15 } },
  { emoji: '💎', name: '钻石', aliases: ['钻石', '宝石', '昂贵', '值钱'], score: 15, needs: { 'D6': 0.50, 'D4': 0.30, 'D8': 0.20 } },
  { emoji: '🔥', name: '火焰', aliases: ['火焰', '火', '牛逼', '狠', '太强'], score: 8, needs: { 'D4': 0.50, 'D8': 0.30, 'D2': 0.20 } },
  { emoji: '💪', name: '强壮', aliases: ['强壮', '肌肉', '加油', '猛', '厉害'], score: 8, needs: { 'D4': 0.50, 'D8': 0.30, 'D2': 0.20 } },
  { emoji: '😤', name: '膨胀', aliases: ['膨胀', '傲慢', '鼻孔', '不屑'], score: 6, needs: { 'D4': 0.70, 'D8': 0.30 } },
  { emoji: '🎩', name: '礼帽', aliases: ['礼帽', '绅士', '高贵', '正式'], score: 10, needs: { 'D6': 0.55, 'D4': 0.30, 'D2': 0.15 } },
  { emoji: '🍷', name: '红酒', aliases: ['红酒', '葡萄酒', '小酌', '品酒'], score: 10, needs: { 'D6': 0.60, 'D2': 0.25, 'D4': 0.15 } },
  { emoji: '🥂', name: '香槟', aliases: ['香槟', '庆祝', '干杯'], score: 10, needs: { 'D2': 0.50, 'D6': 0.30, 'D4': 0.20 } },
  { emoji: '🚗', name: '车', aliases: ['车', '汽车', '驾驶'], score: 8, needs: { 'D8': 0.50, 'D4': 0.30, 'D2': 0.20 } },
  { emoji: '🏎️', name: '跑车', aliases: ['跑车', '赛车', '超跑'], score: 12, needs: { 'D8': 0.50, 'D4': 0.30, 'D6': 0.20 } },
  { emoji: '✈️', name: '飞机', aliases: ['飞机', '飞行', '出国', '旅游'], score: 10, needs: { 'D8': 0.45, 'D2': 0.30, 'D4': 0.25 } },
  { emoji: '💰', name: '钱袋', aliases: ['钱袋', '有钱', '财富'], score: 12, needs: { 'D4': 0.50, 'D8': 0.50 } },
  { emoji: '💸', name: '飞钱', aliases: ['飞钱', '花钱', '消费'], score: 12, needs: { 'D8': 0.50, 'D4': 0.50 } },
  { emoji: '👔', name: '西装', aliases: ['西装', '正装', '职场'], score: 8, needs: { 'D6': 0.50, 'D4': 0.30, 'D2': 0.20 } },
  { emoji: '🤌', name: '捏手指', aliases: ['捏手指', '一点点', '小钱'], score: 8, needs: { 'D8': 0.60, 'D4': 0.40 } },
  { emoji: '🤑', name: '金钱脸', aliases: ['金钱脸', '爱钱', '发财'], score: 12, needs: { 'D8': 0.50, 'D4': 0.50 } },
  { emoji: '🥶', name: '冷酷', aliases: ['冷酷', '冷淡', '无所谓'], score: 6, needs: { 'D6': 0.50, 'D4': 0.50 } },
  { emoji: '😶‍🌫️', name: '云雾中', aliases: ['云雾', '隐藏', '装逼'], score: 8, needs: { 'D6': 0.50, 'D4': 0.30, 'D8': 0.20 } },
  { emoji: '🌞', name: '太阳', aliases: ['太阳', '阳光', '晒照'], score: 5, needs: { 'D6': 0.40, 'D2': 0.30, 'D8': 0.30 } },
  { emoji: '📸', name: '相机', aliases: ['相机', '自拍', '拍照'], score: 6, needs: { 'D6': 0.45, 'D2': 0.35, 'D4': 0.20 } },
  { emoji: '💅', name: '美甲', aliases: ['美甲', '精致', '好看'], score: 7, needs: { 'D6': 0.70, 'D4': 0.30 } },
  { emoji: '☕', name: '咖啡', aliases: ['咖啡', '拿铁', '美式'], score: 6, needs: { 'D6': 0.60, 'D2': 0.20, 'D4': 0.20 } },
  { emoji: '🏆', name: '奖杯', aliases: ['奖杯', '冠军', '第一'], score: 15, needs: { 'D4': 0.50, 'D8': 0.30, 'D2': 0.20 } }
]

// ========== 负面情绪信号规则库（反装逼） ==========
export interface NegativePattern {
  type: string; name: string; keywords: string[]; intensity: number
}

export const NEGATIVE_PATTERNS: NegativePattern[] = [
  { type: 'anxiety', name: '焦虑/恐惧', keywords: ['焦虑', '很焦虑', '害怕', '很害怕', '担心', '好担心', '担心得', '恐惧', '不安', '紧张', '慌', '心慌', '慌得一批', '慌了', '压力', '压力大', '压力很大', '没安全感', '没什么安全感', '胆战心惊', '心惊', '瑟瑟发抖', '怕怕', '忐忑', '睡不着', '失眠', '吃不下', '崩溃', '绷不住', '扛不住'], intensity: 1.0 },
  { type: 'self_doubt', name: '自我否定', keywords: ['没学历', '没能力', '没经验', '拿不出手', '什么都不会', '什么都没有', '不行', '做不到', '没用', '废物', '垃圾', '太差了', '不配', '不配上', '不够好', '没什么好的', '没什么可以', '没什么拿得出', '没什么拿得出手', '一无所有', '没背景', '没资源', '没人要', '没价值', '只有我', '就我一个', '就我'], intensity: 0.9 },
  { type: 'complain_injustice', name: '抱怨/不公平感', keywords: ['不公平', '凭什么', '为什么偏偏', '没有理由', '没理由', '关系户', '走后门', '不公正', '想不通', '太离谱了', '离谱', '过分', '太过分了', '不公平待遇', '黑暗', '无力', '很无奈', '无奈', '没办法', '没有办法'], intensity: 0.7 },
  { type: 'helpless', name: '无助/求助', keywords: ['没人教', '没人带', '没人帮助', '没人照顾', '没人管', '没人', '没有人', '孤独', '孤立', '一个人扛', '不知道怎么办', '不知道该怎么办', '怎么办', '咋办', '该如何是好', '迷茫', '很迷茫', '手足无措', '不知怎么办', '请教一下', '给点建议', '给我点建议', '帮我', '帮帮我', '我该怎么办', '我该咋整', '救一下'], intensity: 0.8 },
  { type: 'negative_situation', name: '负面情境描述', keywords: ['辞退', '被辞退', '裁员', '被裁', '裁掉', '开除', '炒鱿鱼', '失业', '找不到工作', '面试没过', '面试失败', '没通过面试', '试用期', '过不了试用期', '内卷', '竞争激烈', '人心惶惶', '人人自危', '不稳定', '朝不保夕', '饭碗不保', '工作不保'], intensity: 0.8 },
  { type: 'emotional_negative', name: '情绪低落', keywords: ['难受', '难过', '不开心', '郁闷', '烦躁', '很烦', '太烦了', '好烦', '累', '太累了', '身心俱疲', '疲惫', '心力交瘁', 'emo', '破防', '破防了', '泪目', '想哭', '想辞职', '想跑路', '躺平了', '累了', '绝望'], intensity: 0.75 }
]

export const NEGATIVE_EMOJIS = [
  '😰', '😨', '😢', '😭', '😥', '😓', '😞', '😔', '😟', '😕', '🙁', '☹️',
  '😣', '😖', '😫', '😩', '🥺', '😮', '😦', '😧', '😯', '😲', '😱', '😳',
  '🤯', '😵', '😶', '😐', '😑', '😒', '🙄', '😬', '🤕', '🤒', '🤧', '😷'
]

// ========== 装逼人格类型字典 ==========
export interface BraggingPersonality {
  id: string
  name: string
  code: string
  icon: string
  gradientFrom: string
  gradientTo: string
  tagline: string
  description: string
  signaturePhrases: string[]
  archetype: string
  need: string
  lifeProfile: string
  coreNeed: string
  telltaleSigns: string[]
  howToDeal: string
  funFact: string
}

export const BRAGGING_PERSONALITY_TYPES: BraggingPersonality[] = [
  { id: 'd8_ctrl', name: '掌控玩家', code: 'D8-CT', icon: '🎯', gradientFrom: '#ec4899', gradientTo: '#f43f5e', tagline: '场子我说了算', description: '擅长用"轻松""没问题""安排"等表达，低调地展示自己的资源和能力。你越惊讶，TA越满足。', signaturePhrases: ['"打一天"', '"我先安排"', '"一桶够不够"', '"没压力"'], archetype: '社交·控场型', need: 'D8 自由掌控',
    lifeProfile: '生活中的"发起人"和"组织者"。朋友聚会、周末活动、出差接待，TA永远是那个说"我来安排"的人。可能是公司里的团队骨干，或者朋友圈子里的"局主"。喜欢把一切安排得井井有条，享受"一切尽在掌握"的感觉。',
    coreNeed: '表面是"我带你玩"，深层是"我能主导这个场景"——通过定义规则、分配资源、设定节奏，确立自己在社交互动中的主导地位和不可替代性。',
    telltaleSigns: ['话里经常出现"我安排""我先""你放心"', '喜欢量化描述（"打一天""带七个球"）', '对"不确定"的事情会感到不舒服', '即使在休闲场合也想做"说的算"的那个人'],
    howToDeal: '积极配合TA的安排，让TA感受到"被需要"。偶尔提出不同意见也可以，但要用"你觉得这个方案怎么样"的方式。',
    funFact: '掌控玩家的"打一天"往往真的能打一天——不是因为真的想运动，而是因为"全天活动"本身就是一种控场能力的展示。' },
  { id: 'd4_social', name: '自信担当', code: 'D4-SC', icon: '👑', gradientFrom: '#8b5cf6', gradientTo: '#6366f1', tagline: '需要被看见的光芒', description: '通过分享成就、经验、资源等方式间接展示价值。不装则已，一装惊人。', signaturePhrases: ['"也就那样吧"', '"业内"', '"随便搞搞"', '"运气好而已"'], archetype: '成就·展示型', need: 'D4 尊重认可',
    lifeProfile: '生活中有一定成就但不满足于"默默做事"的人。可能在某个行业做出了一些成绩，或者有值得一提的经历。需要被认可，但直接说"我很厉害"会显得尴尬，所以用间接方式让你发现。',
    coreNeed: '表面是分享信息，深层是"展示价值"——希望你能意识到TA的能力、资源或地位。',
    telltaleSigns: ['"也就那样吧""业内"等口头禅', '对"你真厉害"的回应是"还好啦"但嘴角会上扬', '会在对话中不经意"漏出"关键信息'],
    howToDeal: '真诚表达欣赏。别揭穿TA的"低调"，那样会让TA很尴尬。',
    funFact: '自信担当最讨厌的是"你又在装了"——不是因为被揭穿，而是因为这意味着TA精心设计的"低调展示"失败了。' },
  { id: 'd2_hub', name: '社交玩家', code: 'D2-HB', icon: '🤝', gradientFrom: '#0ea5e9', gradientTo: '#06b6d4', tagline: '在人群中发光', description: '主动邀约、慷慨分享、做局安排。把社交做成自己的秀场。', signaturePhrases: ['"我带你"', '"我请你"', '"来我这边"', '"交给我"'], archetype: '社交·关系型', need: 'D2 社交归属',
    lifeProfile: '社交达人。朋友多、饭局多、永远在"组局"。朋友圈很大，消息回复很快。',
    coreNeed: '表面是"我请你""我带你"，深层是"编织关系网"——通过慷慨分享和主动邀约，建立和巩固自己的社交地位。',
    telltaleSigns: ['频繁出现"我带你""我请你"', '消息很多回复很快', '经常提到"我们上次""我和某某"'],
    howToDeal: '接受邀请积极参与，记得回请，这是社交玩家最认可的关系维护方式。',
    funFact: '社交玩家的"我请你"通常不是客气——TA是真的想请，也真心希望你答应。' },
  { id: 'd6_taste', name: '格调担当', code: 'D6-TG', icon: '🍷', gradientFrom: '#f59e0b', gradientTo: '#f97316', tagline: '品味是最低调的炫耀', description: '对细节、品味、规则有独特要求。通过展示与众不同的审美建立优越感。', signaturePhrases: ['"讲究"', '"品质"', '"高级感"', '"懂的人都懂"'], archetype: '审美·格调型', need: 'D6 审美价值',
    lifeProfile: '细节控，对吃什么穿什么用什么有一套标准。可能从事设计、艺术、媒体相关工作。',
    coreNeed: '表面是"这个好"，深层是"我品味好"——通过对品质和审美的独特见解，建立优越感。',
    telltaleSigns: ['频繁出现"讲究""品质""高级感"', '对品牌、材质、工艺有独特见解', '经常"懂的人都懂"式表达'],
    howToDeal: '请教TA的意见，"你觉得这个怎么样"对格调担当是最高级的恭维。',
    funFact: '格调担当最开心的时刻不是被夸奖品味好，而是听到有人说"这个我真不懂你教教我"。' },
  { id: 'd5_teacher', name: '知识输出型', code: 'D5-KW', icon: '🎓', gradientFrom: '#10b981', gradientTo: '#14b8a6', tagline: '信息差=优越感', description: '用"其实""实际上"等方式开始科普。通过输出知识和纠正理解确立话语权。', signaturePhrases: ['"其实吧"', '"你不知道的是"', '"说真的"', '"说白了"'], archetype: '认知·权威型', need: 'D5 认知求知',
    lifeProfile: '生活中的"科普老师"。朋友聊天遇到不懂的问题TA永远是那个开始"其实吧"的人。',
    coreNeed: '表面是"我告诉你真相"，深层是"我掌握信息差"——通过输出知识确立权威。',
    telltaleSigns: ['"其实吧""实际上"是标准开头', '喜欢用"你不知道的是"制造信息差', '聊天经常跑题到"科普模式"'],
    howToDeal: '请教问题认真听，问"还有呢"，知识输出型最享受被认真倾听。',
    funFact: '知识输出型其实挺可爱——TA的"装逼"本质是"忍不住分享"，而且往往真的有用。' },
  { id: 'rm_br', name: '低调大师', code: 'RM-BR', icon: '😌', gradientFrom: '#64748b', gradientTo: '#18181b', tagline: '最顶级的装叫"谦虚"', description: '反向炫耀高手。用"也就那样""一般般"包装惊人的事实。让你越想越酸。', signaturePhrases: ['"也就那样吧"', '"没什么特别的"', '"运气好"', '"一般一般"'], archetype: '反向·高端型', need: 'D4+D6',
    lifeProfile: '高端玩家。真的有很好的资源或成就，但过了"需要直接炫耀"的阶段。装逼是一门艺术——让你在三句话之后才反应过来。',
    coreNeed: '表面是"低调"，深层是"高级炫耀"——用最低调的方式释放最高能的信号。',
    telltaleSigns: ['描述事实时轻描淡写但事实本身很惊人', '常常"谦虚"之后补一句"不过也还行"'],
    howToDeal: '欣赏TA的"艺术"。看出来了就笑着说"你这也太低调了"，TA会非常开心。',
    funFact: '低调大师最爽的时刻是——TA说完"也就那样吧"之后，你在心里默默算完账瞳孔地震的那个瞬间。' },
  { id: 'rs_bg', name: '资源大佬', code: 'RS-BG', icon: '🗝️', gradientFrom: '#eab308', gradientTo: '#d97706', tagline: '什么都能安排', description: '手上总有资源、门路、认识的人。"这事交给我""我那边有关系"是口头禅。', signaturePhrases: ['"我那边"', '"有人"', '"能安排"', '"我兄弟"'], archetype: '资源·社会型', need: 'D8+D2',
    lifeProfile: '门路王。朋友遇到困难第一时间想到TA，因为TA总能"想想办法"。通讯录很厚微信好友很多。',
    coreNeed: '表面是"我能帮你搞定"，深层是"我的社会资本雄厚"。',
    telltaleSigns: ['经常提到"我兄弟""我朋友""认识个人"', '被人找帮忙从不拒绝（但会让你记住人情）'],
    howToDeal: '真诚结交。资源大佬最看重靠谱的朋友。对等交换是最好的相处方式。',
    funFact: '说"想想办法"的时候通常已经有办法了——只是评估"这个人情值不值得出"。' },
  { id: 'nr_fx', name: '佛系选手', code: 'NR-FX', icon: '🌱', gradientFrom: '#22c55e', gradientTo: '#16a34a', tagline: '正常对话，没在装', description: '装逼指数很低。表达自然，语气平和，就是日常聊天。恭喜你遇到正常人。', signaturePhrases: ['"好啊"', '"可以的"', '"没问题"', '"一起吧"'], archetype: '正常·随和型', need: '无显著装逼需求',
    lifeProfile: '表达正常，语气平和。没有强烈装逼欲望也不需要通过对话确立什么地位。',
    coreNeed: '就是正常的社交表达。',
    telltaleSigns: ['语气平和自然', '不刻意强调什么', '聊天就是聊天，没有额外的"信号"'],
    howToDeal: '正常聊天就好。这种对话关系是最轻松的。',
    funFact: '在一群装逼高手里，佛系选手反而最容易被记住——因为"不装"本身就是一种高级格调。' },
  { id: 'd4_invest', name: '价值投资人', code: 'D4-IV', icon: '📊', gradientFrom: '#a855f7', gradientTo: '#7c3aed', tagline: '每一句话都在做"关系估值"', description: '不发无意义的消息。每次聊天都像在"下注"——用最高规格的招待、最精准的用词来投资关系资本。', signaturePhrases: ['"最高规格"', '"仅此一次"', '"别人没有"', '"专为你"'], archetype: '价值·投资型', need: 'D4+D2',
    lifeProfile: '生活中可能是做金融、咨询或项目管理的人。凡事都有 ROI 意识——包括人情。会把"请最好的餐厅""准备最贵的礼物"当作关系投资。',
    coreNeed: '表面是"我用心安排"，深层是"你欠我一笔"——通过超额付出来锁定关系权重，让你在潜意识里承认：这个人是对我最好的。',
    telltaleSigns: ['明确量化付出（"我带7个球"）', '强调唯一性（"仅此一次""专为你"）', '即使小事也用"最"字修辞'],
    howToDeal: '接受时要有"看到"的反馈——"你真细心"不如"你特意准备这么多"有效。偶尔反向投资（回请），让TA感觉关系是双向的。',
    funFact: '价值投资人的"7个球"是严谨计算过的——太多像炫富，太少不够规格，7个刚好是"让人记住又不尴尬"的数字。' },
  { id: 'd3_affect', name: '深情表演家', code: 'D3-AP', icon: '🎭', gradientFrom: '#f472b6', gradientTo: '#db2777', tagline: '用情绪浓度证明在乎', description: '通过强烈的情绪表达（抱怨、委屈、回忆）来证明"我是最在乎你的人"。情绪越浓，地位越难被替代。', signaturePhrases: ['"你知不知道"', '"我有多难受"', '"当年的我们"', '"如果不是因为"'], archetype: '情感·绑定型', need: 'D3 情感陪伴',
    lifeProfile: '情感浓度高，记忆点强。分手后还能翻出三年前的聊天记录念给你听。朋友中的"情感记录员"。',
    coreNeed: '表面是"我在表达情绪"，深层是"我的情绪浓度=我对你的在乎程度=你应该更珍惜我"。',
    telltaleSigns: ['对话中频繁出现情绪词汇', '习惯回忆过往（"以前你从来不这样"）', '情绪表达有"台词感"——抑扬顿挫像排练过'],
    howToDeal: '先共情再讲理。说"我理解你很难受"比"你冷静一下"有效100倍。',
    funFact: '深情表演家的"表演"不是贬义——TA是真的痛，只是TA选择用最有感染力的方式来表达这份痛。' },
  { id: 'd9_judge', name: '道德仲裁官', code: 'D9-JG', icon: '⚖️', gradientFrom: '#ef4444', gradientTo: '#dc2626', tagline: '谁对谁错，我来定', description: '习惯在对话中设立道德标准，用"公平""应该""本来"等词汇划分责任，占据道德高地。', signaturePhrases: ['"本来就应该"', '"你自己说"', '"你又不是不知道"', '"做人要"'], archetype: '伦理·审判型', need: 'D9 公平公正',
    lifeProfile: '生活中的"公道话"发言人。凡事讲原则、讲规矩。可能在法务、教育、公共服务领域工作，或者在朋友圈里扮演"主持公道"的角色。',
    coreNeed: '表面是"我来讲道理"，深层是"我来定义什么是对的"——通过对错标准的设定，获得话语权。',
    telltaleSigns: ['频繁使用"应该""本来""按理说"', '把个人观点包装成普遍原则', '吵架时习惯引用"你自己说过的话"'],
    howToDeal: '先承认TA的标准有道理，再谈差异。说"你说得对，不过这次情况有点特殊"比直接反驳高明。',
    funFact: '道德仲裁官最崩溃的时刻是——对方说"对对对你说得都对"然后继续做完全相反的事。' },
  { id: 'd10_climb', name: '进阶狂人', code: 'D10-CB', icon: '🚀', gradientFrom: '#06b6d4', gradientTo: '#0891b2', tagline: '活着就是为了升级', description: '把任何对话都变成"晒成长"的机会。刚学完一个新技能、读完一本书、拿到一个证，必须让全世界知道。', signaturePhrases: ['"最近在学"', '"考证了"', '"刚完成"', '"下一个目标是"'], archetype: '成长·破圈型', need: 'D10 成长进阶',
    lifeProfile: '终身学习者。朋友圈全是读书笔记和课程打卡。可能在互联网、金融、咨询等"卷王"行业。',
    coreNeed: '表面是"分享成长"，深层是"证明我没停"——通过持续展示进步来缓解"被同龄人超越"的焦虑。',
    telltaleSigns: ['把"最近在学XX"作为聊天开场白', '朋友圈频繁打卡', '对"你在干嘛"的回复永远是"在学习/在运动/在开会"'],
    howToDeal: '请教TA的学习方法。"你怎么这么能坚持"是对TA最高的赞美。',
    funFact: '进阶狂人真正的焦虑不是"学不会"，而是"别人以为我没在进步"。' },
  { id: 'd7_perform', name: '灵魂艺术家', code: 'D7-SA', icon: '🎨', gradientFrom: '#e11d48', gradientTo: '#be123c', tagline: '我即作品', description: '把自己活成一个"品牌"。朋友圈、头像、签名、说话方式都经过精心设计，每个细节都是"我是谁"的视觉锤。', signaturePhrases: ['"这个风格"', '"感觉对了"', '"我的审美"', '"你懂这个吗"'], archetype: '自我·表达型', need: 'D7 自我实现',
    lifeProfile: '创意行业从业者或重度文艺爱好者。可能是个摄影师、设计师、自媒体人或"做自己的"自由职业者。',
    coreNeed: '表面是"表达个性"，深层是"完成自我叙事"——对话不是在沟通，是在"输出个人品牌"。',
    telltaleSigns: ['头像换得很勤', '每句话都有"人设"感', '对"理解"的需求大于"同意"'],
    howToDeal: '别说"你好有个性"——TA早就知道自己有个性了。说"这个角度我没想过"才真的挠到痒处。',
    funFact: '灵魂艺术家最怕的不是被讨厌，而是被认为"平平无奇，和其他人一样"。' }
]

// ========== 核心函数：单条消息分析 ==========
export interface SignalHit {
  pattern: string; patternName: string; need: string; color: string
  reason: string; baseScore: number; adjustedScore: number; matchedKeyword: string
}

export interface NegativeHit { type: string; name: string; keyword: string; intensity: number }

export interface DpuMessageAnalysis {
  textScore: number; emojiScore: number; imageScore: number
  baseScore: number; compositeMultiplier: number; score: number
  signals: SignalHit[]; emojiHits: { emoji: string; name: string; score: number; need: string }[]
  hasImageContent: boolean; hasReverseBrag: boolean
  // DPU 新增：负面情绪与基调信息
  negativeIntensity: number  // 负面信号累计强度；>=2 视为负面情绪主导
  negativeHits: NegativeHit[]
  isNegativeDominated: boolean
  // 需求分布（这条消息的）
  needDistribution: Record<string, number>
  // 主要情绪基调（一句话总结）
  dominantMood: string
  dominantMoodColor: string
}

export function analyzeText(text: string): DpuMessageAnalysis {
  const empty: DpuMessageAnalysis = {
    textScore: 0, emojiScore: 0, imageScore: 0,
    baseScore: 0, compositeMultiplier: 1.0, score: 0,
    signals: [], emojiHits: [],
    hasImageContent: false, hasReverseBrag: false,
    negativeIntensity: 0, negativeHits: [], isNegativeDominated: false,
    needDistribution: {}, dominantMood: '普通表达', dominantMoodColor: '#94a3b8'
  }
  if (!text || text.trim() === '') return empty

  const result: DpuMessageAnalysis = { ...empty, signals: [], emojiHits: [], negativeHits: [], needDistribution: {} }

  // ----- 图片内容检测 -----
  const imageMatch = text.match(/[(（]?图片[:：][^)）\n]*/)
  const nonImageText = imageMatch ? text.replace(imageMatch[0], ' ') : text
  const lowerNonImage = nonImageText.toLowerCase()

  if (imageMatch) {
    result.hasImageContent = true
    const imageContent = imageMatch[0]
    for (const pattern of SIGNAL_PATTERNS) {
      if (pattern.type !== 'image_brag') continue
      for (const kw of pattern.keywords) {
        if (imageContent.includes(kw)) {
          result.imageScore += pattern.baseScore
          const [topNeed] = Object.entries(pattern.needs).sort((a, b) => b[1] - a[1])[0]
          result.signals.push({
            pattern: pattern.type, patternName: '图片·' + pattern.name, need: topNeed,
            color: pattern.color, reason: '图片内容 "' + kw + '"',
            baseScore: pattern.baseScore, adjustedScore: pattern.baseScore, matchedKeyword: kw
          })
          break
        }
      }
    }
    if (result.imageScore === 0) {
      result.imageScore = 8
      result.signals.push({
        pattern: 'image_brag', patternName: '图片炫耀', need: 'D6',
        color: '#F59E0B', reason: '发送图片（视觉炫耀）',
        baseScore: 8, adjustedScore: 8, matchedKeyword: '图片'
      })
    }
  }

  // ----- 第一阶段：先检测负面情绪（关键修复：焦虑/求助/抱怨不是装逼） -----
  let negativeIntensity = 0
  const negativeHits: NegativeHit[] = []
  const negativeSeen = new Set<string>()
  for (const negPattern of NEGATIVE_PATTERNS) {
    for (const kw of negPattern.keywords) {
      if (lowerNonImage.includes(kw) && !negativeSeen.has(negPattern.type + '|' + kw)) {
        negativeSeen.add(negPattern.type + '|' + kw)
        negativeIntensity += negPattern.intensity
        negativeHits.push({ type: negPattern.type, name: negPattern.name, keyword: kw, intensity: negPattern.intensity })
        break
      }
    }
  }
  for (const emoji of NEGATIVE_EMOJIS) {
    if (nonImageText.includes(emoji)) {
      negativeIntensity += 0.5
      negativeHits.push({ type: 'emoji', name: '负面表情', keyword: emoji, intensity: 0.5 })
    }
  }
  const bracketNegativeMatch = nonImageText.match(/[(（][^)）]*(哭|泪|焦虑|担心|害|难|紧张|慌|愁|丧|烦|怕|难过)[^)）]*[)）]/g)
  if (bracketNegativeMatch) {
    negativeIntensity += bracketNegativeMatch.length * 0.5
    for (const m of bracketNegativeMatch) {
      negativeHits.push({ type: 'bracket_negative', name: '负面情绪描述', keyword: m, intensity: 0.5 })
    }
  }
  result.negativeIntensity = negativeIntensity
  result.negativeHits = negativeHits
  // 超过 1.5 强度视为"负面情绪主导"——此时装逼信号要被严重打折扣
  result.isNegativeDominated = negativeIntensity >= 1.5

  // ----- 第二阶段：检测装逼关键词（但在负面情绪语境下打折扣） -----
  // 折扣比例：
  //   negativeIntensity >= 3.0 → 0.1（几乎清零）
  //   >= 2.0 → 0.15
  //   >= 1.5 → 0.2
  //   >= 0.8 → 0.5
  //   < 0.8 → 1.0（正常）
  const bragDiscount =
    negativeIntensity >= 3.0 ? 0.10 :
    negativeIntensity >= 2.0 ? 0.15 :
    negativeIntensity >= 1.5 ? 0.20 :
    negativeIntensity >= 0.8 ? 0.50 : 1.0

  for (const pattern of SIGNAL_PATTERNS) {
    if (pattern.type === 'image_brag') continue
    for (const kw of pattern.keywords) {
      if (lowerNonImage.includes(kw)) {
        if (pattern.type === 'reverse_brag') result.hasReverseBrag = true
        const adjustedScore = pattern.baseScore * bragDiscount
        result.textScore += adjustedScore
        const [topNeed] = Object.entries(pattern.needs).sort((a, b) => b[1] - a[1])[0]
        result.signals.push({
          pattern: pattern.type, patternName: pattern.name, need: topNeed,
          color: pattern.color, reason: '提到 "' + kw + '"',
          baseScore: pattern.baseScore, adjustedScore, matchedKeyword: kw
        })
        break
      }
    }
  }

  // ----- 第三阶段：检测装逼表情（同样受负面情绪折扣） -----
  for (const e of SHOWOFF_EMOJIS) {
    if (nonImageText.includes(e.emoji)) {
      const adjustedScore = e.score * bragDiscount
      result.emojiScore += adjustedScore
      const [topNeed] = Object.entries(e.needs).sort((a, b) => b[1] - a[1])[0]
      result.emojiHits.push({ emoji: e.emoji, name: e.name, score: adjustedScore, need: topNeed })
    }
  }

  // ----- 组合系数（仅在非负面主导时才放大） -----
  result.baseScore = result.textScore + result.emojiScore + result.imageScore
  let composite = 1.0
  const reasons: string[] = []
  if (!result.isNegativeDominated) {
    const hasText = result.textScore > 0
    const hasEmoji = result.emojiScore > 0
    const hasImage = result.imageScore > 0
    if (hasText && hasEmoji && hasImage) { composite = 2.0; reasons.push('文字+表情+图片三类叠加') }
    else if (hasText && hasEmoji) { composite = 1.3; reasons.push('文字+表情组合') }
    else if (hasText && hasImage) { composite = 1.5; reasons.push('文字+图片组合') }
    else if (hasEmoji && hasImage) { composite = 1.4; reasons.push('表情+图片组合') }
    else if (hasImage && !hasText && !hasEmoji) { composite = 1.2; reasons.push('纯图片炫耀') }
    if (result.hasReverseBrag && result.textScore > 0) { composite *= 1.2; reasons.push('含反向炫耀（"也就那样"型）') }
  }
  result.compositeMultiplier = composite
  result.score = Math.round(result.baseScore * composite)

  // ----- 需求分布（这条消息各维度的"势能"） -----
  const needDist: Record<string, number> = { 'D2': 0, 'D4': 0, 'D5': 0, 'D6': 0, 'D8': 0 }
  for (const hit of result.signals) {
    const pattern = SIGNAL_PATTERNS.find(p => p.type === hit.pattern)
    if (pattern) {
      for (const [needId, ratio] of Object.entries(pattern.needs)) {
        needDist[needId] = (needDist[needId] || 0) + hit.adjustedScore * (ratio || 0)
      }
    }
  }
  for (const eHit of result.emojiHits) {
    const pattern = SHOWOFF_EMOJIS.find(p => p.emoji === eHit.emoji)
    if (pattern) {
      for (const [needId, ratio] of Object.entries(pattern.needs)) {
        needDist[needId] = (needDist[needId] || 0) + eHit.score * (ratio || 0)
      }
    }
  }
  result.needDistribution = needDist

  // ----- 主要情绪基调（给 UI 一句话展示用） -----
  if (negativeIntensity >= 2.0) {
    const topNeg = [...negativeHits].sort((a, b) => b.intensity - a.intensity)[0]
    result.dominantMood = topNeg ? `${topNeg.name}主导（"${topNeg.keyword}"）` : '负面情绪表达'
    result.dominantMoodColor = '#f59e0b'
  } else if (negativeIntensity >= 1.0) {
    const topNeg = [...negativeHits].sort((a, b) => b.intensity - a.intensity)[0]
    result.dominantMood = `有${topNeg?.name || '负面'}倾向的表达`
    result.dominantMoodColor = '#eab308'
  } else if (result.signals.length >= 2) {
    const topSignal = result.signals.sort((a, b) => b.adjustedScore - a.adjustedScore)[0]
    result.dominantMood = `${topSignal.patternName}（"${topSignal.matchedKeyword}"）`
    result.dominantMoodColor = topSignal.color
  } else if (result.signals.length === 1) {
    result.dominantMood = `轻度${result.signals[0].patternName}倾向`
    result.dominantMoodColor = '#64748b'
  } else {
    result.dominantMood = '自然表达 · 无显著信号'
    result.dominantMoodColor = '#64748b'
  }

  return result
}

// ========== 聚合：角色级分析 ==========
export interface DpuRoleAnalysis {
  roleName: string
  messageCount: number
  // 需求分布（百分比，总和为 100）
  needDistribution: Record<string, number>
  // 各维度绝对得分（用来做对比）
  needRawScores: Record<string, number>
  // 装逼指数 0-100
  bragIndex: number
  bragLevel: string
  // 信号汇总
  aggregatedSignals: SignalHit[]
  negativeSummary: { totalIntensity: number; hits: NegativeHit[]; dominantTypes: string[] }
  // 主要基调（一句话）
  dominantMood: string
  dominantMoodColor: string
  // 是否装逼主导（为 false 时 UI 不应展示"装逼人格"，而应展示情绪分析）
  isBragDominated: boolean
  // 装逼人格类型（仅在装逼主导时有效）
  personality?: BraggingPersonality
}

export function analyzeRole(roleName: string, messages: string[]): DpuRoleAnalysis {
  const perMsg = messages.map(m => analyzeText(m))
  const count = Math.max(perMsg.length, 1)

  // 累计需求原始得分
  const raw: Record<string, number> = { 'D2': 0, 'D4': 0, 'D5': 0, 'D6': 0, 'D8': 0 }
  let totalBragScore = 0
  const allSignals: SignalHit[] = []
  let totalNegativeIntensity = 0
  const allNegHits: NegativeHit[] = []

  for (const a of perMsg) {
    for (const [k, v] of Object.entries(a.needDistribution)) raw[k] = (raw[k] || 0) + v
    totalBragScore += a.score
    allSignals.push(...a.signals)
    totalNegativeIntensity += a.negativeIntensity
    allNegHits.push(...a.negativeHits)
  }

  // 归一化 → 百分比
  const sum = Object.values(raw).reduce((s, v) => s + v, 0)
  const pct: Record<string, number> = {}
  for (const k of Object.keys(raw)) pct[k] = sum > 0 ? Math.round((raw[k] / sum) * 100) : 0
  // 确保总和 100
  const pctSum = Object.values(pct).reduce((s, v) => s + v, 0)
  if (sum > 0 && pctSum !== 100) {
    const maxKey = Object.entries(pct).sort((a, b) => b[1] - a[1])[0][0]
    pct[maxKey] = pct[maxKey] + (100 - pctSum)
  }

  // 装逼指数：把 0-∞ 的总分压缩到 0-100
  // 经验基准：每条消息 15 分算重度装逼。即 "messageCount * 15" 视为 100 分基准线
  // 但负面情绪主导时，额外打折
  const avgPerMsg = totalBragScore / count
  let bragIndex = Math.min(100, Math.round((avgPerMsg / 18) * 100))
  // 负面情绪越强 → 装逼指数越低（就算有装逼词也不算）
  const avgNegIntensity = totalNegativeIntensity / count
  if (avgNegIntensity >= 2.0) bragIndex = Math.min(bragIndex, 10)
  else if (avgNegIntensity >= 1.0) bragIndex = Math.min(bragIndex, 25)
  else if (avgNegIntensity >= 0.5) bragIndex = Math.min(bragIndex, 45)

  const bragLevel =
    bragIndex >= 70 ? '重度装逼' :
    bragIndex >= 50 ? '中度装逼' :
    bragIndex >= 25 ? '轻度装逼倾向' :
    bragIndex >= 10 ? '自然表达（低装逼倾向）' : '完全正常对话'

  // 是否装逼主导：
  //   · 平均负面情绪强度 < 0.5 AND 装逼指数 >= 30 → 视为装逼主导
  //   · 否则视为"自然/求助/焦虑"主导
  const isBragDominated = avgNegIntensity < 0.8 && bragIndex >= 30

  // 主要基调
  let dominantMood = ''
  let dominantMoodColor = '#64748b'
  if (avgNegIntensity >= 1.5) {
    const typeCounts: Record<string, number> = {}
    for (const h of allNegHits) typeCounts[h.type] = (typeCounts[h.type] || 0) + 1
    const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t)
    dominantMood = `主要情绪：${topTypes.map(t => NEGATIVE_PATTERNS.find(p => p.type === t)?.name || t).join(' · ')}`
    dominantMoodColor = '#f59e0b'
  } else if (bragIndex >= 50) {
    const topNeed = Object.entries(pct).sort((a, b) => b[1] - a[1])[0]
    const needName = DPU_NEEDS.find(n => n.id === topNeed[0])?.name || topNeed[0]
    dominantMood = `${needName}主导（装逼倾向明显）`
    const need = DPU_NEEDS.find(n => n.id === topNeed[0])
    dominantMoodColor = need?.color || '#8b5cf6'
  } else {
    dominantMood = '自然表达 · 无显著装逼信号'
    dominantMoodColor = '#64748b'
  }

  // 推断人格类型
  const personality = inferBraggingPersonality(bragIndex, pct, isBragDominated)

  // 聚合负面信号 summary（为 UI 展示用）
  const negTypeCounts: Record<string, number> = {}
  for (const h of allNegHits) negTypeCounts[h.type] = (negTypeCounts[h.type] || 0) + 1
  const dominantNegTypes = Object.entries(negTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => NEGATIVE_PATTERNS.find(p => p.type === t)?.name || t)

  return {
    roleName, messageCount: count,
    needDistribution: pct, needRawScores: raw,
    bragIndex, bragLevel,
    aggregatedSignals: allSignals,
    negativeSummary: {
      totalIntensity: totalNegativeIntensity,
      hits: allNegHits.slice(0, 20),  // 保留前 20 个给 UI 展示
      dominantTypes: dominantNegTypes
    },
    dominantMood, dominantMoodColor,
    isBragDominated,
    personality
  }
}

// ========== 装逼人格类型推断 ==========
function inferBraggingPersonality(bragIndex: number, needDistribution: Record<string, number>, isBragDominated: boolean): BraggingPersonality | undefined {
  // 如果不是装逼主导 → 返回"佛系选手"作为兜底
  if (!isBragDominated) {
    return BRAGGING_PERSONALITY_TYPES.find(p => p.code === 'NR-FX')
  }

  // 装逼主导时：根据主要需求维度选型
  const sortedNeeds = Object.entries(needDistribution).sort((a, b) => b[1] - a[1])
  const topNeed = sortedNeeds[0]?.[0] || 'D4'
  const secondNeed = sortedNeeds[1]?.[0]
  const topPct = sortedNeeds[0]?.[1] || 0

  // 强反向炫耀模式 → 低调大师（检测到 hasReverseBrag 时优先级最高）
  // 这里信息不够，交给 isBragDominated 的调用方判断；用"最大需求维度"兜底
  const candidates: string[] = []
  if (topNeed === 'D8') candidates.push('d8_ctrl')
  if (topNeed === 'D4') candidates.push(secondNeed === 'D6' ? 'rm_br' : 'd4_social')
  if (topNeed === 'D6') candidates.push('d6_taste')
  if (topNeed === 'D2') candidates.push('d2_hub')
  if (topNeed === 'D5') candidates.push('d5_teacher')
  // D8+D2+资源关键词 → 资源大佬（这里无法检查关键词，靠上层）
  if (topNeed === 'D8' && secondNeed === 'D2' && needDistribution['D2'] && needDistribution['D2'] >= 20) {
    candidates.push('rs_bg')
  }

  const pick = candidates[0] || 'd4_social'
  return BRAGGING_PERSONALITY_TYPES.find(p => p.id === pick) || BRAGGING_PERSONALITY_TYPES[0]
}

// ========== UI 辅助函数：把一条分析结果做成"装逼信号卡片"的行 ==========
export function summarizeSignals(role: DpuRoleAnalysis, topN = 5): {
  type: string; name: string; count: number; totalAdjustedScore: number; color: string
}[] {
  const byType: Record<string, { count: number; score: number; color: string; name: string }> = {}
  for (const s of role.aggregatedSignals) {
    if (!byType[s.pattern]) byType[s.pattern] = { count: 0, score: 0, color: s.color, name: s.patternName }
    byType[s.pattern].count += 1
    byType[s.pattern].score += s.adjustedScore
  }
  return Object.entries(byType)
    .map(([type, data]) => ({ type, name: data.name, count: data.count, totalAdjustedScore: data.score, color: data.color }))
    .sort((a, b) => b.totalAdjustedScore - a.totalAdjustedScore)
    .slice(0, topN)
}

// ========== UI 辅助函数：返回"装逼指数"的渐变色 ==========
export function colorForBragIndex(index: number): { from: string; to: string } {
  if (index >= 70) return { from: '#ef4444', to: '#b91c1c' }
  if (index >= 50) return { from: '#f97316', to: '#c2410c' }
  if (index >= 25) return { from: '#eab308', to: '#a16207' }
  if (index >= 10) return { from: '#10b981', to: '#047857' }
  return { from: '#22c55e', to: '#15803d' }
}
