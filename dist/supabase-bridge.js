// supabase-bridge.js
const SUPABASE_CONFIG = {
  url: 'https://wmlstgssbtrftukgxupo.supabase.co', 
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtbHN0Z3NzYnRyZnR1a2d4dXBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1OTIwODksImV4cCI6MjA3MTE2ODA4OX0.-t-fZ4QuaaV_BNSpA_ncqy50-SVADOdqLwWVZaH81II', 
};

// Supabase 클라이언트 초기화 (CDN 버전 사용)
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
document.head.appendChild(script);

script.onload = function() {
  console.log('🚀 Supabase Bridge 초기화 시작');
  
  // Supabase 클라이언트 생성
  const supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  
  // 원본 localStorage 함수 저장
  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalGetItem = localStorage.getItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);
  const originalClear = localStorage.clear.bind(localStorage);
  
  // 테이블 매핑
  const TABLE_MAP = {
    tax_bills: 'tax_bills',
    charging_stations: 'charging_stations',
    user_accounts: 'user_accounts',
    notifications: 'notifications',
    trash: 'trash',
    notification_settings: 'notification_settings',
    email_log: 'email_log',
    api_settings: 'api_settings',
    system_config: 'system_config',
    notification_assignments: 'notification_assignments'
  };
  
  // Supabase 헬퍼 함수
  const supabaseAPI = {
    // 데이터 저장/업데이트
    save: async function(tableName, data) {
      console.log(`📤 Supabase 저장 시도: ${tableName}`, data);
      
      try {
        if (Array.isArray(data)) {
          // 배열인 경우 - 전체 교체 방식
          if (data.length === 0) {
            // 빈 배열이면 테이블 비우기
            const { error } = await supabase
              .from(tableName)
              .delete()
              .neq('id', 0);
              
            if (error && error.code !== 'PGRST116') {
              console.error(`❌ 테이블 비우기 실패:`, error);
            }
            return true;
          }
          
          // charging_stations는 name이 PK
          if (tableName === 'charging_stations') {
            // 기존 데이터 삭제
            await supabase.from(tableName).delete().neq('name', '');
            
            // 새 데이터 삽입
            const { error } = await supabase
              .from(tableName)
              .insert(data);
              
            if (error) {
              console.error(`❌ charging_stations 저장 실패:`, error);
              return false;
            }
          } else {
            // 다른 테이블들은 ID 기반
            // 먼저 기존 데이터 삭제
            await supabase.from(tableName).delete().neq('id', 0);
            
            // ID가 없는 항목에 ID 생성
            const dataWithIds = data.map(item => {
              if (tableName === 'tax_bills' || tableName === 'trash' || tableName === 'notifications') {
                return {
                  ...item,
                  id: item.id || Date.now() + Math.floor(Math.random() * 1000000)
                };
              }
              return item;
            });
            
            // 새 데이터 삽입
            const { error } = await supabase
              .from(tableName)
              .insert(dataWithIds);
              
            if (error) {
              console.error(`❌ ${tableName} 저장 실패:`, error);
              return false;
            }
          }
        } else {
          // 단일 객체
          const dataToSave = tableName === 'charging_stations' 
            ? data  // charging_stations는 name이 PK
            : { ...data, id: data.id || Date.now() };
            
          const { error } = await supabase
            .from(tableName)
            .upsert(dataToSave);
            
          if (error) {
            console.error(`❌ 단일 객체 저장 실패:`, error);
            return false;
          }
        }
        
        console.log(`✅ Supabase 저장 성공: ${tableName}`);
        return true;
      } catch (error) {
        console.error(`❌ Supabase 저장 에러:`, error);
        return false;
      }
    },
    
    // 데이터 로드
    load: async function(tableName) {
      console.log(`📥 Supabase 로드 시도: ${tableName}`);
      
      try {
        let query = supabase.from(tableName).select('*');
        
        // 정렬 조건 추가
        if (tableName === 'notifications') {
          query = query.order('created_at', { ascending: false });
        } else if (tableName === 'tax_bills') {
          query = query.order('due_date', { ascending: true });
        } else if (tableName === 'charging_stations') {
          query = query.order('name', { ascending: true });
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.error(`❌ Supabase 로드 실패 (${tableName}):`, error);
          return [];
        }
        
        // 데이터 형식 조정
        const formattedData = data ? data.map(item => {
          // notifications의 data 필드는 JSON으로 파싱
          if (tableName === 'notifications' && item.data && typeof item.data === 'string') {
            try {
              item.data = JSON.parse(item.data);
            } catch (e) {
              console.error('JSON 파싱 실패:', e);
            }
          }
          
          // tax_bills의 amount 필드 처리
          if (tableName === 'tax_bills') {
            if (item.amount === '0' || item.amount === 0) {
              item.amount = '미정';
            }
          }
          
          return item;
        }) : [];
        
        console.log(`✅ ${tableName} 로드 성공: ${formattedData.length}개 레코드`);
        return formattedData;
      } catch (error) {
        console.error(`❌ Supabase 로드 에러:`, error);
        return [];
      }
    },
    
    // 데이터 삭제
    delete: async function(tableName, id) {
      console.log(`🗑️ Supabase 삭제: ${tableName}, ID: ${id}`);
      
      try {
        let query;
        if (tableName === 'charging_stations') {
          query = supabase.from(tableName).delete().eq('name', id);
        } else {
          query = supabase.from(tableName).delete().eq('id', id);
        }
        
        const { error } = await query;
        
        if (error) {
          console.error(`❌ Supabase 삭제 실패:`, error);
          return false;
        }
        
        console.log(`✅ 삭제 성공`);
        return true;
      } catch (error) {
        console.error(`❌ Supabase 삭제 에러:`, error);
        return false;
      }
    }
  };
  
  // localStorage 오버라이드
  localStorage.setItem = function(key, value) {
    console.log(`💾 localStorage.setItem: ${key}`, value ? value.substring(0, 100) + '...' : 'null');
    
    // 원본 localStorage에 저장
    originalSetItem(key, value);
    
    // 특정 키는 로컬에만 저장
    const localOnlyKeys = [
      'airtable_synced',
      'supabase_synced',
      'initial_load_done',
      'sb-wmlstgssbtrftukgxupo-auth-token',
      'sb-wmlstgssbtrftukgxupo-auth-token-code-verifier'
];
    
    if (localOnlyKeys.includes(key)) {
      console.log(`🔒 ${key}는 로컬에만 저장`);
      return;
    }
    
    // Supabase에도 저장
    if (TABLE_MAP[key]) {
      try {
        const parsedData = JSON.parse(value);
        supabaseAPI.save(TABLE_MAP[key], parsedData)
          .then(success => {
            if (!success) {
              console.warn(`⚠️ Supabase 저장 실패: ${key}`);
            }
          })
          .catch(error => {
            console.error(`❌ Supabase 저장 에러:`, error);
          });
      } catch (error) {
        console.error('Parse error:', error);
      }
    }
  };
  
  // localStorage.getItem 오버라이드 (디버깅용)
  localStorage.getItem = function(key) {
    const value = originalGetItem(key);
    if (key !== 'initial_load_done' && key !== 'supabase_synced') {
      console.log(`📖 localStorage.getItem: ${key} = ${value ? '있음' : '없음'}`);
    }
    return value;
  };
  
  // localStorage.removeItem 오버라이드
  localStorage.removeItem = function(key) {
    console.log(`🗑️ localStorage.removeItem: ${key}`);
    originalRemoveItem(key);
  };
  
  // localStorage.clear 오버라이드
  localStorage.clear = function() {
    console.log(`🗑️ localStorage.clear 호출됨`);
    originalClear();
  };
  
  // 초기 데이터 동기화
  async function initSync() {
    console.log('🔄 Supabase 동기화 시작...');
    
    // 동기화 플래그 확인
    const syncTime = sessionStorage.getItem('supabase_synced');
    const currentTime = Date.now();
    
    // 5분 이내에 동기화했으면 스킵
    if (syncTime && (currentTime - parseInt(syncTime)) < 5 * 60 * 1000) {
      console.log('✅ 최근 동기화됨 - 스킵');
      return;
    }
    
    // 기본 사용자 데이터 (백업용)
    const defaultUsers = [{
      id: 1,
      email: "contact@watercharging.com",
      password: "watercontact!@",
      name: "시스템 관리자",
      role: "super_admin",
      status: "active",
      created_at: "2024-01-01"
    }];
    
    let needsReload = false;
    
    // 각 테이블 동기화
    for (const [localKey, tableName] of Object.entries(TABLE_MAP)) {
      try {
        console.log(`🔄 ${localKey} 동기화 중...`);
        const data = await supabaseAPI.load(tableName);
        
        if (data && data.length > 0) {
          originalSetItem(localKey, JSON.stringify(data));
          console.log(`✅ ${localKey}: ${data.length}개 레코드`);
          needsReload = true;
        } else if (localKey === 'user_accounts') {
          // user_accounts가 비어있으면 기본값 사용
          console.log('📝 기본 사용자 데이터 설정');
          originalSetItem(localKey, JSON.stringify(defaultUsers));
          // Supabase에도 저장
          await supabaseAPI.save(tableName, defaultUsers);
        } else {
          // 빈 배열로 초기화
          const currentData = originalGetItem(localKey);
          if (!currentData) {
            originalSetItem(localKey, JSON.stringify([]));
            console.log(`📭 ${localKey}: 빈 배열로 초기화`);
          }
        }
      } catch (error) {
        console.error(`❌ ${localKey} 동기화 실패:`, error);
        
        // 실패 시 기본값 설정
        if (localKey === 'user_accounts') {
          originalSetItem(localKey, JSON.stringify(defaultUsers));
        } else {
          const currentData = originalGetItem(localKey);
          if (!currentData) {
            originalSetItem(localKey, JSON.stringify([]));
          }
        }
      }
    }
    
    // 동기화 완료 표시
    sessionStorage.setItem('supabase_synced', currentTime.toString());
    console.log('✨ Supabase 동기화 완료!');
    
    // 초기 로드 시에만 리로드 (무한 루프 방지)
    if (needsReload && !sessionStorage.getItem('initial_load_done')) {
      sessionStorage.setItem('initial_load_done', 'true');
      console.log('🔄 페이지 새로고침...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
    
    // 디버그 정보 출력
    console.log('📦 현재 localStorage 상태:');
    for (const key of Object.keys(TABLE_MAP)) {
      const value = originalGetItem(key);
      if (value) {
        try {
          const parsed = JSON.parse(value);
          console.log(`  ${key}: ${Array.isArray(parsed) ? parsed.length : 1}개 항목`);
        } catch (e) {
          console.log(`  ${key}: 파싱 불가`);
        }
      }
    }
  }
  
  // 페이지 로드 시 동기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSync);
  } else {
    // 이미 로드된 경우 즉시 실행
    setTimeout(initSync, 100);
  }
  
  // 디버깅용 전역 함수
  window.supabaseClient = supabase;
  window.supabaseAPI = supabaseAPI;
  window.SUPABASE_CONFIG = SUPABASE_CONFIG;
  
  // 디버그 함수들
  window.debugStorage = function() {
    console.log('📦 전체 localStorage 내용:');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      console.log(`${key}:`, value);
    }
  };
  
  window.clearSync = function() {
    console.log('🗑️ 모든 데이터 초기화');
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };
  
  window.forceSync = async function() {
    console.log('🔄 강제 동기화 시작');
    sessionStorage.removeItem('supabase_synced');
    sessionStorage.removeItem('initial_load_done');
    await initSync();
  };
  
  window.testSupabase = async function() {
    console.log('🧪 Supabase 연결 테스트');
    const { data, error } = await supabase
      .from('user_accounts')
      .select('*');
    
    if (error) {
      console.error('❌ 연결 실패:', error);
    } else {
      console.log('✅ 연결 성공! user_accounts:', data);
    }
  };
  
  console.log('✅ Supabase Bridge 준비 완료!');
  console.log('💡 사용 가능한 명령어:');
  console.log('  - debugStorage(): localStorage 내용 확인');
  console.log('  - clearSync(): 모든 데이터 초기화');
  console.log('  - forceSync(): 강제 동기화');
  console.log('  - testSupabase(): 연결 테스트');
};

// 스크립트 로드 실패 시
script.onerror = function() {
  console.error('❌ Supabase 라이브러리 로드 실패!');

};
