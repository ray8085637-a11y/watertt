// airtable-bridge.js
const AIRTABLE_CONFIG = {
  apiKey: 'patAVVVZZSzpeJsZK.14af1cfaa9987e374fbefb4c136b0458fdf9809e731cdb20e129155507900795', // 실제 API 키로 교체
  baseId: 'appWPars9GqKM5LiS', // 실제 Base ID로 교체
  tables: {
    tax_bills: 'tax_bills',
    charging_stations: 'charging_stations',
    user_accounts: 'user_accounts',
    notifications: 'notifications',
    trash: 'Trash',  // 대문자 T로 수정!
    notification_settings: 'notification_settings',
    email_log: 'email_log',
    api_settings: 'api_settings',
    system_config: 'Imported%20table'  // 공백을 %20으로 인코딩
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
        // 데이터를 레코드 형식으로 변환
        let records = [];
        
        if (Array.isArray(data)) {
          // 배열인 경우 각 항목을 레코드로 변환
          records = data.slice(0, 10).map(item => ({
            fields: {
              ...item,
              // Date 필드 형식 맞추기
              dueDate: item.dueDate || undefined,
              uploadedAt: item.uploadedAt || undefined,
              completedDate: item.completedDate || undefined,
              // 숫자 필드 변환
              amount: item.amount === "미정" ? 0 : (parseInt(item.amount) || 0)
            }
          }));
        } else {
          // 단일 객체인 경우
          records = [{
            fields: data
          }];
        }
        
        // Airtable API 호출 (최대 10개씩 전송)
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_CONFIG.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ records })
        });
        
        if (!response.ok) {
          const error = await response.json();
          console.error('Airtable save error:', error);
          return false;
        }
        
        return true;
      } catch (error) {
        console.error('Airtable save error:', error);
        return false;
      }
    },
    
    // 데이터 로드
    load: async function(tableName) {
      const url = `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${tableName}`;
      
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${AIRTABLE_CONFIG.apiKey}`
          }
        });
        
        if (!response.ok) {
          const error = await response.json();
          console.error('Airtable load error:', error);
          return null;
        }
        
        const result = await response.json();
        
        if (result.records && result.records.length > 0) {
          // Airtable 레코드를 원본 데이터 형식으로 변환
          return result.records.map(record => ({
            ...record.fields,
            airtableId: record.id,
            // 금액 필드 처리
            amount: record.fields.amount === 0 ? "미정" : (record.fields.amount || "미정")
          }));
        }
        
        return [];
      } catch (error) {
        console.error('Airtable load error:', error);
        return null;
      }
    },
    
    // 데이터 업데이트
    update: async function(tableName, recordId, data) {
      const url = `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${tableName}/${recordId}`;
      
      try {
        const response = await fetch(url, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_CONFIG.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: data
          })
        });
        
        return response.ok;
      } catch (error) {
        console.error('Airtable update error:', error);
        return false;
      }
    },
    
    // 데이터 삭제
    delete: async function(tableName, recordId) {
      const url = `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${tableName}/${recordId}`;
      
      try {
        const response = await fetch(url, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_CONFIG.apiKey}`
          }
        });
        
        return response.ok;
      } catch (error) {
        console.error('Airtable delete error:', error);
        return false;
      }
    }
  };
  
  // localStorage 오버라이드
  localStorage.setItem = function(key, value) {
    // 원본 localStorage에 저장
    originalSetItem(key, value);
    
    // Airtable에도 저장 (지원되는 테이블만)
    if (AIRTABLE_CONFIG.tables[key]) {
      try {
        const parsedData = JSON.parse(value);
        airtableAPI.save(AIRTABLE_CONFIG.tables[key], parsedData)
          .then(success => {
            if (success) {
              console.log(`✅ Airtable 저장 성공: ${key}`);
            } else {
              console.error(`❌ Airtable 저장 실패: ${key}`);
            }
          });
      } catch (error) {
        console.error('Data parse error:', error);
      }
    }
  };
  
  // 페이지 로드 시 Airtable에서 데이터 동기화
  window.addEventListener('DOMContentLoaded', async () => {
    console.log('🔄 Airtable 데이터 동기화 시작...');
    
    // 각 테이블에서 데이터 로드 시도
    for (const [key, tableName] of Object.entries(AIRTABLE_CONFIG.tables)) {
      try {
        const data = await airtableAPI.load(tableName);
        if (data && data.length > 0) {
          originalSetItem(key, JSON.stringify(data));
          console.log(`✅ ${key} 동기화 완료 (${data.length}개 레코드)`);
        } else {
          console.log(`📭 ${key} 테이블이 비어있음`);
        }
      } catch (error) {
        console.error(`❌ ${key} 동기화 실패:`, error);
      }
    }
    
    // React 앱이 데이터를 다시 읽도록 트리거
    console.log('✨ Airtable 동기화 완료!');
    
    // 로그인 화면이 나타나도록 약간의 지연 후 리로드
    setTimeout(() => {
      window.location.reload();
    }, 500);
  });
  
  // 디버깅용: 전역 함수로 Airtable API 노출
  window.airtableAPI = airtableAPI;
  window.AIRTABLE_CONFIG = AIRTABLE_CONFIG;
})();


