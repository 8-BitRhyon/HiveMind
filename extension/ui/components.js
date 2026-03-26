// HMLogger and HMToast are now provided by core modules (logger.js, ui/toast.js)
// This file only provides HMUI helpers.

var HMUI = {
    setLoading: function(btnId, isLoading, defaultText) {
        var btn = document.getElementById(btnId);
        if(!btn) return;
        
        if(isLoading) {
            btn.innerHTML = `<span class="hm-spinner"></span> Processing...`;
            btn.disabled = true;
        } else {
            btn.innerHTML = defaultText || "ACTION";
            btn.disabled = false;
        }
    },
    confirm: function(title, body, onConfirm) {
        var modal = document.getElementById("HM_Modal");
        var mTitle = document.getElementById("HM_ModalTitle");
        var mBody = document.getElementById("HM_ModalBody");
        var btnConfirm = document.getElementById("HM_ModalConfirm");
        var btnCancel = document.getElementById("HM_ModalCancel");

        if(!modal || !mTitle || !mBody) return;

        mTitle.innerText = title;
        mBody.innerHTML = body;
        modal.style.display = "flex";

        btnConfirm.onclick = () => {
             modal.style.display = "none";
             if(onConfirm) onConfirm();
        };

        btnCancel.onclick = () => {
             modal.style.display = "none";
        };
    },

    // Single-button modal for informational alerts (no cancel)
    alert: function(title, body, onDismiss) {
        var modal = document.getElementById("HM_Modal");
        var mTitle = document.getElementById("HM_ModalTitle");
        var mBody = document.getElementById("HM_ModalBody");
        var btnConfirm = document.getElementById("HM_ModalConfirm");
        var btnCancel = document.getElementById("HM_ModalCancel");

        if(!modal || !mTitle || !mBody) return;

        mTitle.innerText = title;
        mBody.innerHTML = body;
        modal.style.display = "flex";

        // Hide cancel, show only OK
        if (btnCancel) btnCancel.style.display = "none";
        btnConfirm.innerText = "OK";

        btnConfirm.onclick = () => {
            modal.style.display = "none";
            btnConfirm.innerText = "CONFIRM";
            if (btnCancel) btnCancel.style.display = "";
            if (onDismiss) onDismiss();
        };
    }
};
