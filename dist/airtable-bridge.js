// airtable-bridge.js
const AIRTABLE_CONFIG = {
  apiKey: 'patXr7ny0VfIsz2Uo.d937df857f94373de65368743916ad4d1c9fb745eb846cc4e1b4b4c24a6a0310', // 보안을 위해 실제 키는 여기에 넣지 마세요
  baseId: 'appWPars9GqKM5LiS',
  tables: {
    bills: 'bills',
    stations: 'stations',
    accounts: 'accounts',
    notifications: 'notifications',
    trash: 'trash',
    notification_settings: 'notification_settings',
    email_log: 'email_log',
    api_settings: 'api_settings'
  }
};

// localStorage 오버라이드로 Airtable 연동
(function() {
  // 원본 함수 저장
  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalGetItem = localStorage.getItem.bind(localStorage);
  
  // 동기화 상태 확인
  const SYNC_FLAG = 'airtable_sync_completed';
  
  // Airtable 헬퍼 함수들
  const airtableAPI = {
    // 데이터 저장
    save: async function(tableName, data) {
      const url = `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${tableName}`;
      
      try {
        let records = [];
        
        if (Array.isArray(data)) {
          // 배열인 경우 각 항목을 레코드로 변환 (최대 10개)
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
        
        // 403 에러 처리
        if (response.status === 403) {
          console.warn(`⚠️ 권한 없음: ${tableName} 테이블 건너뜀`);
          return [];
        }
        
        if (!response.ok) {
          console.error(`Airtable load error for ${tableName}:`, response.status);
          return [];
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
        console.error(`Airtable load error for ${tableName}:`, error);
        return [];
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
              console.warn(`⚠️ Airtable 저장 실패: ${key}`);
            }
          })
          .catch(error => {
            console.error(`❌ Airtable 저장 에러: ${key}`, error);
          });
      } catch (error) {
        console.error('Data parse error:', error);
      }
    }
  };
  
  // 페이지 로드 시 Airtable에서 데이터 동기화 (한 번만!)
  window.addEventListener('DOMContentLoaded', async () => {
    // 이미 동기화했으면 건너뛰기
    const syncTime = sessionStorage.getItem(SYNC_FLAG);
    const currentTime = Date.now();
    
    // 5분 이내에 동기화했으면 건너뛰기
    if (syncTime && (currentTime - parseInt(syncTime)) < 5 * 60 * 1000) {
      console.log('✅ Airtable 최근 동기화됨 - 건너뛰기');
      return;
    }
    
    console.log('🔄 Airtable 데이터 동기화 시작...');
    
    let syncSuccess = false;
    
    // 각 테이블에서 데이터 로드 시도
    for (const [key, tableName] of Object.entries(AIRTABLE_CONFIG.tables)) {
      try {
        const data = await airtableAPI.load(tableName);
        if (data && data.length > 0) {
          originalSetItem(key, JSON.stringify(data));
          console.log(`✅ ${key} 동기화 완료 (${data.length}개 레코드)`);
          syncSuccess = true;
        } else {
          console.log(`📭 ${key} 테이블이 비어있음`);
        }
      } catch (error) {
        console.error(`❌ ${key} 동기화 실패:`, error);
      }
    }
    
    // 동기화 완료 표시
    sessionStorage.setItem(SYNC_FLAG, currentTime.toString());
    console.log('✨ Airtable 동기화 완료!');
    
    // 무한 루프 방지: 동기화 후 리로드 제거!
    // 대신 필요한 경우에만 수동으로 리로드
    if (syncSuccess && !localStorage.getItem('is_logged_in')) {
      // 처음 접속 시에만 리로드
      if (!sessionStorage.getItem('initial_load_done')) {
        sessionStorage.setItem('initial_load_done', 'true');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    }
  });
  
  // 디버깅용: 전역 함수로 Airtable API 노출
  window.airtableAPI = airtableAPI;
  window.AIRTABLE_CONFIG = AIRTABLE_CONFIG;
  
  // 수동 동기화 함수
  window.syncAirtable = async function() {
    sessionStorage.removeItem(SYNC_FLAG);
    window.location.reload();
  };
})();


