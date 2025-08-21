// airtable-bridge.js
const AIRTABLE_CONFIG = {
  apiKey: 'patAVVVZZSzpeJsZK.14af1cfaa9987e374fbefb4c136b0458fdf9809e731cdb20e129155507900795', 
  baseId: 'appWPars9GqKM5LiS', 
  tables: {
    tax_bills: 'tax_bills',
    charging_stations: 'charging_stations', 
    user_accounts: 'user_accounts',
    notifications: 'notifications',
    trash: 'trash',
    notification_settings: 'notification_settings',
    email_log: 'email_log',
    api_settings: 'api_settings',
    system_config: 'system_config'
  }
};

// localStorage 오버라이드로 Airtable 연동
(function() {
  // 원본 함수 저장
  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalGetItem = localStorage.getItem.bind(localStorage);
  
  // Airtable 헬퍼 함수들
  const airtableAPI = {
    // 데이터 저장
    save: async function(tableName, data) {
      const url = `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${tableName}`;
      
      try {
        // 기존 레코드 조회 (업데이트를 위해)
        const existing = await this.load(tableName);
        
        // 전체 데이터를 하나의 레코드로 저장
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_CONFIG.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            records: [{
              fields: {
                data: JSON.stringify(data),
                table_name: tableName,
                updated_at: new Date().toISOString()
              }
            }]
          })
        });
        
        return response.ok;
      } catch (error) {
        console.error('Airtable save error:', error);
        return false;
      }
    },
    
    // 데이터 로드
    load: async function(tableName) {
      const url = `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${tableName}?filterByFormula={table_name}="${tableName}"&sort[0][field]=updated_at&sort[0][direction]=desc`;
      
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${AIRTABLE_CONFIG.apiKey}`
          }
        });
        
        if (!response.ok) return null;
        
        const result = await response.json();
        if (result.records && result.records.length > 0) {
          return JSON.parse(result.records[0].fields.data);
        }
        return null;
      } catch (error) {
        console.error('Airtable load error:', error);
        return null;
      }
    }
  };
  
  // localStorage 오버라이드
  localStorage.setItem = function(key, value) {
    // 원본 localStorage에도 저장 (백업)
    originalSetItem(key, value);
    
    // Airtable에도 저장
    if (AIRTABLE_CONFIG.tables[key]) {
      airtableAPI.save(AIRTABLE_CONFIG.tables[key], JSON.parse(value))
        .then(success => {
          if (success) {
            console.log(`✅ Airtable 저장 성공: ${key}`);
          } else {
            console.error(`❌ Airtable 저장 실패: ${key}`);
          }
        });
    }
  };
  
  // 페이지 로드 시 Airtable에서 데이터 동기화
  window.addEventListener('DOMContentLoaded', async () => {
    console.log('🔄 Airtable 데이터 동기화 시작...');
    
    for (const [key, tableName] of Object.entries(AIRTABLE_CONFIG.tables)) {
      const data = await airtableAPI.load(tableName);
      if (data) {
        originalSetItem(key, JSON.stringify(data));
        console.log(`✅ ${key} 동기화 완료`);
      }
    }
    
    // React 앱 리로드 트리거
    window.location.reload();
  });
})();