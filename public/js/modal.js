function Modal(modalId, width){
  var modalId = modalId;
  $("body").append("<div class='tooltip' id='"+modalId+"'></div>");
  //$("body").append("<div id='"+modalId+"'></div>");

  if(width){
    $("#"+modalId).css("width", width);
  }

  hideModal();

  function showModal(content) {
    $("#"+modalId).html(content);
    $("#"+modalId).show();
  }

  function hideModal(){
    $("#"+modalId).hide();
  }

  

  return {
    showModal: showModal,
    hideModal: hideModal,
    
  }
}
