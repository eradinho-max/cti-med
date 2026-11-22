/* CTI v32 loader — preserva v31 e adiciona MB32 */
(function(){
  function load(src, cb){
    var s=document.createElement('script');
    s.src=src; s.defer=true;
    s.onload=function(){ cb && cb(); };
    s.onerror=function(){ console.error('CTI: falha ao carregar', src); };
    document.head.appendChild(s);
  }
  load('/static/cti-app-v31.js?v=31.0.2', function(){
    load('/static/sync.js?v=2.2.0', function(){
      load('/static/mb32.js?v=32.0.1', function(){
      load('/static/mb33.js?v=33.0.1', function(){
        load('/static/kotu.js?v=32.1.0');
        load('/static/cera.js?v=1.0.3', function(){
          load('/static/inteligencia-core.js?v=1.0.0', function(){
            load('/static/inteligencia.js?v=1.0.0');
          });
        });
      });
    });
    });
  });
})();
