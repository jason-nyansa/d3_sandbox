'use strict';

angular.module('resources', [])

.factory('ApGraphData', ['$q', '$http',
  function($q, $http) {
    return {
      load: function() {
        var deferred = $q.defer();

        $http.get('resources/ap-graph-data.json').then(
          function(data) {
            deferred.resolve(data);
          },
          function() {
            deferred.reject({});
          });

        return deferred.promise;
      }
    };
}])

;
