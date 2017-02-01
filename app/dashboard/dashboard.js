'use strict';

angular.module('dashboard', ['resources', 'widgets'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/dashboard', {
    templateUrl: 'dashboard/dashboard-tpl.html',
    controller: 'DashboardCtrl',
  });
}])

.controller('DashboardCtrl', ['$scope', 'ApGraphData',
  function($scope, ApGraphData) {
    ApGraphData.load()
      .then(function(resp) {
        $scope.apGraphData = resp.data;
      });
}])

;
