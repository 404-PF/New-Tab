// src/ai/offline-mode.js - Offline mode response engine
// Provides local responses when API is unavailable

const OfflineMode = (function() {
  // Random facts for offline mode (English)
  const FACTS_EN = [
    'The human brain uses about 20% of the body\'s total energy.',
    'A day on Venus is longer than a year on Venus.',
    'Honey never spoils. Archaeologists have found 3000-year-old honey that was still edible.',
    'Octopuses have three hearts and blue blood.',
    'The shortest war in history lasted 38-45 minutes between Britain and Zanzibar in 1896.',
    'Bananas are berries, but strawberries aren\'t.',
    'There are more stars in the universe than grains of sand on all of Earth\'s beaches.',
    'The Eiffel Tower can be 15 cm taller during hot summer days.',
    'A jiffy is an actual unit of time: 1/100th of a second.',
    'The world\'s oldest known living tree is over 5,000 years old.',
    'Water can boil and freeze at the same time under the right pressure and temperature.',
    'The Amazon rainforest produces 20% of the world\'s oxygen.',
    'A group of flamingos is called a \'flamboyance\'.',
    'The human eye can distinguish approximately 10 million different colors.',
    'Lightning strikes the Earth about 8 million times per day.',
    'The average human body contains enough carbon to make 900 pencils.',
    'Some metals can explode when they come into contact with water.',
    'The heart of a blue whale is so large that a small child could crawl through its arteries.',
    'A teaspoonful of neutron star would weigh 6 billion tons.',
    'Hawaii moves 7.5cm closer to Alaska every year due to tectonic plates.'
  ];

  // Random facts for offline mode (Chinese)
  const FACTS_ZH = [
    '人类的大脑消耗了身体总能量的约20%。',
    '金星上的一天比金星上的一年还要长。',
    '蜂蜜永远不会变质。考古学家发现了3000年前仍然可食用的蜂蜜。',
    '章鱼有三颗心脏和蓝色的血液。',
    '历史上最短的战争是1896年英国与桑给巴尔之间的战争，持续了38-45分钟。',
    '香蕉是浆果，但草莓不是。',
    '宇宙中的星星比地球上所有海滩的沙子还要多。',
    '埃菲尔铁塔在炎热的夏天可以长高15厘米。',
    '瞬间（jiffy）是一个实际的时间单位：百分之一秒。',
    '世界上已知最古老的活树已有5000多年历史。',
    '水在适当的压力和温度下可以同时沸腾和结冰。',
    '亚马逊雨林产生了世界氧气的20%。',
    '一群火烈鸟被称为 \'flamboyance\'（火烈鸟群）。',
    '人眼可以分辨大约1000万种不同的颜色。',
    '地球每天遭受约800万次雷击。',
    '成人体内的碳足以制作900支铅笔。',
    '一些金属在接触水时会爆炸。',
    '蓝鲸的心脏非常大，一个小孩可以从它的动脉中爬过。',
    '一茶匙中子星的重量为60亿吨。',
    '由于板块构造，夏威夷每年向阿拉斯加靠近7.5厘米。'
  ];

  // Unit conversions
  const CONVERSIONS = {
    length: {
      km: { m: 1000, cm: 100000, mm: 1000000, mi: 0.621371, ft: 3280.84, in: 39370.1, yd: 1093.61 },
      m: { km: 0.001, cm: 100, mm: 1000, mi: 0.000621371, ft: 3.28084, in: 39.3701, yd: 1.09361 },
      cm: { km: 0.00001, m: 0.01, mm: 10, mi: 0.00000621371, ft: 0.0328084, in: 0.393701, yd: 0.0109361 },
      mi: { km: 1.60934, m: 1609.34, cm: 160934, mm: 1609340, ft: 5280, in: 63360, yd: 1760 },
      ft: { km: 0.0003048, m: 0.3048, cm: 30.48, mm: 304.8, mi: 0.000189394, in: 12, yd: 0.333333 },
      in: { km: 0.0000254, m: 0.0254, cm: 2.54, mm: 25.4, mi: 0.0000157828, ft: 0.0833333, yd: 0.0277778 }
    },
    weight: {
      kg: { g: 1000, mg: 1000000, lb: 2.20462, oz: 35.274, ton: 0.00110231 },
      g: { kg: 0.001, mg: 1000, lb: 0.00220462, oz: 0.035274, ton: 0.00000110231 },
      lb: { kg: 0.453592, g: 453.592, mg: 453592, oz: 16, ton: 0.0005 },
      oz: { kg: 0.0283495, g: 28.3495, mg: 28349.5, lb: 0.0625, ton: 0.00003125 }
    },
    temperature: {
      C: { F: (c) => c * 9/5 + 32, K: (c) => c + 273.15 },
      F: { C: (f) => (f - 32) * 5/9, K: (f) => (f - 32) * 5/9 + 273.15 },
      K: { C: (k) => k - 273.15, F: (k) => (k - 273.15) * 9/5 + 32 }
    }
  };

  // Knowledge base - pattern to response mapping (English)
  const KNOWLEDGE_BASE_EN = {
    // Greetings
    'hello': 'Hello! I\'m your AI assistant. I\'m currently in offline mode, but I can still help with basic questions, calculations, conversions, and more!',
    'hi': 'Hi there! I\'m running in offline mode right now. Try asking about facts, math, or unit conversions!',
    'hey': 'Hey! I\'m here in offline mode. What can I help you with?',
    'greetings': 'Greetings! I\'m operating in offline mode. Ask me about facts, math, or unit conversions!',
    
    // Help
    'help': 'I\'m in offline mode. Here\'s what I can help with:\n\n• Facts - Ask for a random fact\n• Math - Calculate expressions like "5 + 3" or "sqrt(16)"\n• Conversions - Try "5 km to miles" or "100 F to C"\n• Date/Time - Ask "what time is it?" or "what date is it?"\n• Weather - Ask "what\'s the weather like?"\n• Just chat - I can have basic conversations!',
    'what can you do': 'In offline mode I can:\n\n• Answer general knowledge questions\n• Do math calculations\n• Convert units (length, weight, temperature)\n• Tell you the time and date\n• Share interesting facts\n• Have basic conversations',
    'commands': 'Available offline commands:\n\n• "fact" or "random fact" - Get a fun fact\n• "time" - Current time\n• "date" - Today\'s date\n• "[number] [operation] [number]" - Calculator\n• "[number] [unit] to [unit]" - Conversion',
    
    // Time and date
    'time': () => `The current time is ${new Date().toLocaleTimeString()}.`,
    'what time is it': () => `The time is ${new Date().toLocaleTimeString()}.`,
    'date': () => `Today is ${new Date().toLocaleDateString()}.`,
    'what date is it': () => `Today is ${new Date().toLocaleDateString()}.`,
    'day': () => `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}.`,
    
    // Facts
    'fact': () => getRandomFact('en'),
    'facts': () => getRandomFact('en'),
    'random fact': () => getRandomFact('en'),
    'tell me a fact': () => getRandomFact('en'),
    'interesting fact': () => getRandomFact('en'),
    'did you know': () => getRandomFact('en'),
    
    // About
    'who are you': 'I\'m the AI Assistant for this New Tab page. Normally I connect to OpenRouter for AI-powered responses, but when offline I provide basic assistance through local features.',
    'what are you': 'I\'m an AI assistant built into this New Tab extension. I can help with questions, calculations, conversions, and more!',
    'your name': 'I\'m the AI Assistant for this New Tab page. You can call me Assistant!',
    
    // Capabilities
    'offline': 'Yes, I\'m currently in offline mode! I can still help with:\n\n• Math calculations\n• Unit conversions\n• Basic facts\n• Time and date\n• General conversation',
    'online': 'I\'m currently in offline mode, but I can switch to online mode when the API is available. I\'ll automatically reconnect!',
    'network error': 'It looks like there was a network issue connecting to the AI service. I\'m using offline mode to continue helping you. The AI will reconnect automatically when the network is available.'
  };

  // Knowledge base - pattern to response mapping (Chinese)
  const KNOWLEDGE_BASE_ZH = {
    // Greetings
    '你好': '你好！我是你的AI助手。我目前处于离线模式，但仍可以帮助你回答基本问题、计算、单位换算等！',
    '嗨': '嗨！我现在处于离线模式。试试问我关于事实、数学或单位换算的问题吧！',
    '嘿': '嘿！我在离线模式。能帮你什么？',
    '您好': '您好！我正在离线模式运行。问我关于事实、数学或单位换算吧！',
    
    // Help
    '帮助': '我在离线模式。以下是我能帮助的：\n\n• 事实 - 询问一个随机事实\n• 数学 - 计算表达式如 "5 + 3" 或 "sqrt(16)"\n• 换算 - 试试 "5 公里 to 英里" 或 "100 华氏度 to 摄氏度"\n• 日期/时间 - 问"现在几点？"或"今天是几号？"\n• 聊天 - 我可以进行基本对话！',
    '你能做什么': '在离线模式下我可以：\n\n• 回答常识问题\n• 进行数学计算\n• 单位换算（长度、重量、温度）\n• 告诉你时间和日期\n• 分享有趣的事实\n• 进行基本对话',
    '命令': '可用离线命令：\n\n• "事实" 或 "随机事实" - 获取有趣的事实\n• "时间" - 当前时间\n• "日期" - 今天的日期\n• "[数字] [运算] [数字]" - 计算器\n• "[数字] [单位] to [单位]" - 换算',
    
    // Time and date
    '时间': () => `现在时间是 ${new Date().toLocaleTimeString('zh-CN')}。`,
    '现在几点': () => `现在是 ${new Date().toLocaleTimeString('zh-CN')}。`,
    '日期': () => `今天是 ${new Date().toLocaleDateString('zh-CN')}。`,
    '今天是几号': () => `今天是 ${new Date().toLocaleDateString('zh-CN')}。`,
    '星期几': () => `今天是 ${new Date().toLocaleDateString('zh-CN', { weekday: 'long' })}。`,
    
    // Facts
    '事实': () => getRandomFact('zh'),
    'facts': () => getRandomFact('zh'),
    '随机事实': () => getRandomFact('zh'),
    '告诉我一个事实': () => getRandomFact('zh'),
    '有趣的事实': () => getRandomFact('zh'),
    '你知道吗': () => getRandomFact('zh'),
    
    // About
    '你是谁': '我是这个新标签页的AI助手。通常我连接到OpenRouter获取AI响应，但在离线时我通过本地功能提供基本帮助。',
    '你是什么': '我是内置在这个新标签扩展中的AI助手。我可以帮助你回答问题、数学计算、单位换算等！',
    '你的名字': '我是这个新标签页的AI助手。你可以叫我助手！',
    
    // Capabilities
    '离线': '是的，我目前处于离线模式！我仍然可以帮助：\n\n• 数学计算\n• 单位换算\n• 基本事实\n• 时间和日期\n• 一般对话',
    '在线': '我目前处于离线模式，但当API可用时可以切换到在线模式。会自动重新连接！',
    '网络错误': '看起来连接AI服务时出现网络问题。我正在使用离线模式继续帮助你。当网络可用时，AI会自动重新连接。'
  };

  /**
   * Get current language
   * @returns {string} Current language code
   */
  function getCurrentLanguage() {
    if (window.i18n && window.i18n.currentLanguage) {
      return window.i18n.currentLanguage();
    }
    return localStorage.getItem('language') || 'en';
  }

  /**
   * Get a random fact
   * @param {string} lang - Language code
   * @returns {string} A random fact
   */
  function getRandomFact(lang) {
    const language = lang || getCurrentLanguage();
    const facts = language === 'zh' ? FACTS_ZH : FACTS_EN;
    const index = Math.floor(Math.random() * facts.length);
    
    const prefix = language === 'zh' ? '你知道吗？' : 'Did you know? ';
    return prefix + facts[index];
  }

  /**
   * Get the appropriate knowledge base based on language
   * @returns {Object} Knowledge base object
   */
  function getKnowledgeBase() {
    const lang = getCurrentLanguage();
    return lang === 'zh' ? KNOWLEDGE_BASE_ZH : KNOWLEDGE_BASE_EN;
  }

  /**
   * Match input against knowledge base patterns
   * @param {string} input - User input
   * @returns {Object} Match result with response
   */
  function matchPattern(input) {
    if (!input) return null;
    
    const lowerInput = input.toLowerCase().trim();
    const knowledgeBase = getKnowledgeBase();
    
    // Direct match
    if (knowledgeBase[lowerInput]) {
      const response = knowledgeBase[lowerInput];
      return {
        matched: true,
        response: typeof response === 'function' ? response() : response
      };
    }
    
    // Also check original input for Chinese
    if (knowledgeBase[input.trim()]) {
      const response = knowledgeBase[input.trim()];
      return {
        matched: true,
        response: typeof response === 'function' ? response() : response
      };
    }
    
    // Partial match - check if any key is contained in input
    for (const key in knowledgeBase) {
      if (lowerInput.includes(key) && key.length > 2) {
        const response = knowledgeBase[key];
        return {
          matched: true,
          response: typeof response === 'function' ? response() : response
        };
      }
      // Also check Chinese keys
      if (input.trim().includes(key) && key.length > 1) {
        const response = knowledgeBase[key];
        return {
          matched: true,
          response: typeof response === 'function' ? response() : response
        };
      }
    }
    
    return { matched: false };
  }

  /**
   * Parse and evaluate a mathematical expression
   * @param {string} input - Math expression
   * @returns {string} Result or null if invalid
   */
  function parseMath(input) {
    
    let result = null;
    
    // Basic addition, subtraction, multiplication, division
    let match = input.match(/^(-?\d+\.?\d*)\s*([+\-*/])\s*(-?\d+\.?\d*)$/);
    if (match) {
      const a = parseFloat(match[1]);
      const op = match[2];
      const b = parseFloat(match[3]);
      
      switch (op) {
        case '+': result = a + b; break;
        case '-': result = a - b; break;
        case '*': result = a * b; break;
        case '/': result = b !== 0 ? a / b : 'undefined (division by zero)'; break;
      }
    }
    
    // Square root
    if (!result) {
      match = input.match(/^sqrt\((\d+\.?\d*)\)$/);
      if (match) {
        const num = parseFloat(match[1]);
        result = Math.sqrt(num);
      }
    }
    
    // Power
    if (!result) {
      match = input.match(/^(-?\d+\.?\d*)\s*\^\s*(\d+)$/);
      if (match) {
        const base = parseFloat(match[1]);
        const exp = parseInt(match[2]);
        result = Math.pow(base, exp);
      }
    }
    
    // Percentage: "50% of 100"
    if (!result) {
      match = input.match(/^(\d+\.?\d*)%\s*of\s*(\d+\.?\d*)$/);
      if (match) {
        const percent = parseFloat(match[1]);
        const num = parseFloat(match[2]);
        result = (percent / 100) * num;
      }
    }
    
    // Modulo: "10 mod 3"
    if (!result) {
      match = input.match(/^(\d+)\s*(?:mod|modulo)\s*(\d+)$/);
      if (match) {
        const a = parseInt(match[1]);
        const b = parseInt(match[2]);
        result = a % b;
      }
    }
    
    if (result !== null && result !== undefined && !isNaN(result)) {
      // Round to reasonable precision
      if (typeof result === 'number' && !Number.isInteger(result)) {
        result = Math.round(result * 1000000) / 1000000;
      }
      return `The result is: ${result}`;
    }
    
    return null;
  }

  /**
   * Parse and perform unit conversion
   * @param {string} input - Conversion query
   * @returns {string} Result or null if invalid
   */
  function parseConversion(input) {
    // Pattern: "5 km to miles" or "100 fahrenheit to celsius" or Chinese "5 公里 to 英里"
    const patterns = [
      /^(-?\d+\.?\d*)\s*(km|m|cm|mm|ft|in|mi|yd|公里|千米|米|厘米|毫米|英里|英尺|英寸|码)\s+(?:to|in|->|转换|换算)\s+(km|m|cm|mm|ft|in|mi|yd|公里|千米|米|厘米|毫米|英里|英尺|英寸|码)$/i,
      /^(-?\d+\.?\d*)\s*(kg|g|mg|lb|oz|ton|千克|克|毫克|磅|盎司|吨)\s+(?:to|in|->|转换|换算)\s+(kg|g|mg|lb|oz|ton|千克|克|毫克|磅|盎司|吨)$/i,
      /^(-?\d+\.?\d*)\s*(celsius|c|fahrenheit|f|kelvin|k|摄氏度|华氏度|开尔文|摄|华|开)\s+(?:to|in|->|转换|换算)\s+(celsius|c|fahrenheit|f|kelvin|k|摄氏度|华氏度|开尔文|摄|华|开)$/i
    ];
    
    // Chinese unit name mappings
    const chineseUnitMap = {
      '公里': 'km', '千米': 'km',
      '米': 'm',
      '厘米': 'cm',
      '毫米': 'mm',
      '英里': 'mi',
      '英尺': 'ft', '尺': 'ft',
      '英寸': 'in',
      '码': 'yd',
      '千克': 'kg', '公斤': 'kg',
      '克': 'g',
      '毫克': 'mg',
      '磅': 'lb',
      '盎司': 'oz',
      '吨': 'ton',
      '摄氏度': 'C', '摄': 'C',
      '华氏度': 'F', '华': 'F',
      '开尔文': 'K', '开': 'K'
    };
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        let fromUnit = match[2].toLowerCase();
        let toUnit = match[3].toLowerCase();
        
        // Convert Chinese units to English
        if (chineseUnitMap[fromUnit]) fromUnit = chineseUnitMap[fromUnit];
        if (chineseUnitMap[toUnit]) toUnit = chineseUnitMap[toUnit];
        
        // Normalize unit names
        const unitMap = {
          'celsius': 'C', 'c': 'C',
          'fahrenheit': 'F', 'f': 'F',
          'kelvin': 'K', 'k': 'K'
        };
        
        const from = unitMap[fromUnit] || fromUnit;
        const to = unitMap[toUnit] || toUnit;
        
        // Check if conversion is valid
        let result;
        
        // Temperature conversion
        if (CONVERSIONS.temperature[from] && CONVERSIONS.temperature[from][to]) {
          const convertFn = CONVERSIONS.temperature[from][to];
          result = convertFn(value);
          result = Math.round(result * 100) / 100;
          return `${value}°${from.toUpperCase()} = ${result}°${to.toUpperCase()}`;
        }
        
        // Length/weight conversion
        const category = Object.keys(CONVERSIONS).find(cat => 
          CONVERSIONS[cat][from] && CONVERSIONS[cat][from][to]
        );
        
        if (category) {
          const factor = CONVERSIONS[category][from][to];
          result = value * factor;
          result = Math.round(result * 10000) / 10000;
          return `${value} ${from} = ${result} ${to}`;
        }
        
        const lang = getCurrentLanguage();
        const errorMsg = lang === 'zh' 
          ? `抱歉，我无法从 ${match[2]} 转换到 ${match[3]}。`
          : `Sorry, I can't convert from ${fromUnit} to ${toUnit}.`;
        return errorMsg;
      }
    }
    
    return null;
  }

  /**
   * Get a response for user input
   * @param {string} input - User input
   * @returns {Object} Response object
   */
  function getResponse(input) {
    const lang = getCurrentLanguage();
    
    // Default messages based on language
    const defaultMessages = {
      en: {
        noUnderstand: 'I didn\'t understand that. Try asking for help!',
        cantProcess: 'I\'m in offline mode and couldn\'t process that specific request. Try:\n\n• "help" for available commands\n• "fact" for a random fact\n• "5 + 3" for math\n• "10 km to miles" for conversion',
        offline: 'I\'m in offline mode right now. The AI assistant will be available when the network connection is restored.'
      },
      zh: {
        noUnderstand: '我没有理解你的意思。试着请求帮助！',
        cantProcess: '我在离线模式，无法处理这个特定请求。试试：\n\n• "帮助" 查看可用命令\n• "事实" 获取随机事实\n• "5 + 3" 进行数学计算\n• "10 公里 to 英里" 进行换算',
        offline: '我目前处于离线模式。网络连接恢复后，AI助手将可用。'
      }
    };
    
    const messages = defaultMessages[lang] || defaultMessages.en;
    
    if (!input || typeof input !== 'string') {
      return { 
        success: false, 
        content: messages.noUnderstand,
        mode: 'offline'
      };
    }
    
    const trimmed = input.trim();
    
    // Try math calculation
    const mathResult = parseMath(trimmed);
    if (mathResult) {
      return {
        success: true,
        content: mathResult,
        mode: 'offline'
      };
    }
    
    // Try unit conversion
    const conversionResult = parseConversion(trimmed);
    if (conversionResult) {
      return {
        success: true,
        content: conversionResult,
        mode: 'offline'
      };
    }
    
    // Try knowledge base
    const patternResult = matchPattern(trimmed);
    if (patternResult && patternResult.matched) {
      return {
        success: true,
        content: patternResult.response,
        mode: 'offline'
      };
    }
    
    // Default response for unrecognized input
    return {
      success: true,
      content: messages.cantProcess,
      mode: 'offline'
    };
  }

  /**
   * Get a simple acknowledgment response
   * @returns {Object} Response object
   */
  function getAcknowledgment() {
    const lang = getCurrentLanguage();
    const messages = {
      en: 'I\'m in offline mode right now. The AI assistant will be available when the network connection is restored.',
      zh: '我目前处于离线模式。网络连接恢复后，AI助手将可用。'
    };
    
    return {
      success: true,
      content: messages[lang] || messages.en,
      mode: 'offline'
    };
  }

  // Public API
  return {
    getResponse,
    getAcknowledgment,
    matchPattern,
    parseMath,
    parseConversion,
    getRandomFact
  };

})();

// Export to global scope
window.OfflineMode = OfflineMode;
