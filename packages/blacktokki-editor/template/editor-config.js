editorConfig = {
    plugins: 'image link charmap advlist lists paste hr', //autoresize textcolor imagetools,
    toolbar: 'fontsizeselect | bold italic underline strikethrough | undo redo | alignleft aligncenter alignright | bullist numlist | hr link', // charmap removeformat
    setup: (editor)=>{
    }
}
if (typeof module !== 'undefined') {
    module.exports = editorConfig
}
