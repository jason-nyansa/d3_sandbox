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
      .then(function(data) {
        $scope.apGraphData = data;
      });

    $scope.$watch('activeTab', function(tabIndex) {
      $scope.$broadcast('tabChanged', tabIndex);
    });
}])

;
